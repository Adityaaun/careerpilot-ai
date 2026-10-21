import fs from "fs";
import path from "path";
import {
  ApplicationRecord,
  ApplicationRecordSchema,
  ApplicationSubmissionResult,
  ApplicationStatus,
} from "../types/application";
import { JobListing } from "../types/job";
import { getJobDataset } from "./jobMatcher";
import {
  isPostgresConfigured,
  pgGetApplications,
  pgInsertApplication,
  pgUpdateApplicationStatus,
} from "../db/postgres";

// In-process write lock queue to serialize concurrent operations safely in local mode
let writeQueue: Promise<unknown> = Promise.resolve();

// In-memory fallback if file system is read-only in local dev mode
const memoryFallbackStore: ApplicationRecord[] = [];

export interface StorageStatus {
  backend: "postgres" | "local_fallback";
  isPersistent: boolean;
  message: string;
}

/**
 * Returns current active storage backend status
 */
export function getStorageStatus(): StorageStatus {
  if (isPostgresConfigured()) {
    return {
      backend: "postgres",
      isPersistent: true,
      message: "Connected to persistent PostgreSQL database.",
    };
  }
  return {
    backend: "local_fallback",
    isPersistent: false,
    message:
      "Running on local filesystem fallback. DATABASE_URL is not set. Data will not persist across serverless restarts.",
  };
}

function getStoragePath(customPath?: string): string {
  if (customPath) {
    return path.resolve(customPath);
  }
  if (process.env.APPLICATIONS_STORAGE_PATH) {
    return path.resolve(process.env.APPLICATIONS_STORAGE_PATH);
  }
  if (process.env.VERCEL) {
    return path.join("/tmp", "applications.json");
  }
  return path.join(process.cwd(), "data", "applications.json");
}

/**
 * Safely reads and validates application records from local filesystem storage
 */
export function readApplications(customPath?: string): ApplicationRecord[] {
  const filePath = getStoragePath(customPath);

  try {
    if (!fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) {
        fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
      }
      fs.writeFileSync(/*turbopackIgnore: true*/ filePath, "[]", "utf-8");
      return [...memoryFallbackStore];
    }

    const raw = fs.readFileSync(/*turbopackIgnore: true*/ filePath, "utf-8").trim();
    if (!raw) return [...memoryFallbackStore];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      // Quarantine corrupted file to avoid silent data destruction
      const backupPath = `${filePath}.corrupt.${Date.now()}`;
      try {
        fs.copyFileSync(filePath, backupPath);
        console.warn(`[ApplicationStore] Quarantined corrupted storage to: ${backupPath}`);
      } catch {
        // ignore backup error
      }
      throw new Error(`Applications storage file is malformed JSON: ${(err as Error).message}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error("Applications storage expected a JSON array of records.");
    }

    const validRecords: ApplicationRecord[] = [];
    for (const item of parsed) {
      const result = ApplicationRecordSchema.safeParse(item);
      if (result.success) {
        validRecords.push(result.data);
      }
    }

    // Merge in-memory records if any
    for (const m of memoryFallbackStore) {
      if (!validRecords.some((r) => r.id === m.id || r.jobId === m.jobId)) {
        validRecords.push(m);
      }
    }

    return validRecords;
  } catch (err) {
    if ((err as Error).message.includes("malformed JSON")) {
      throw err;
    }
    return [...memoryFallbackStore];
  }
}

/**
 * Atomically writes records to storage using a temporary file and rename
 */
async function atomicWriteApplications(
  records: ApplicationRecord[],
  customPath?: string
): Promise<void> {
  const filePath = getStoragePath(customPath);
  const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const dir = path.dirname(filePath);

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const serialized = JSON.stringify(records, null, 2);
    await fs.promises.writeFile(tempPath, serialized, "utf-8");
    await fs.promises.rename(tempPath, filePath);
  } catch {
    memoryFallbackStore.length = 0;
    memoryFallbackStore.push(...records);
  }
}

/**
 * Records a new application for a job with duplicate prevention and validation.
 * Uses PostgreSQL if configured, otherwise falls back to local file.
 */
export async function recordApplication(
  params: {
    jobId: string;
    notes?: string;
    candidateName?: string;
  },
  customStoragePath?: string,
  customJobs?: JobListing[]
): Promise<ApplicationSubmissionResult> {
  const { jobId, notes, candidateName } = params;

  if (!jobId || typeof jobId !== "string" || jobId.trim().length === 0) {
    return {
      success: false,
      error: "A valid Job ID is required to apply.",
      externalNotice: "Please provide a valid job ID.",
    };
  }

  // 1. Verify that job exists in dataset (read-only verification)
  const jobs = customJobs || getJobDataset();
  const job = jobs.find((j) => j.id === jobId.trim());

  if (!job) {
    return {
      success: false,
      error: `Job with ID "${jobId}" was not found in the verified dataset.`,
      externalNotice: "Unable to find the requested job listing.",
    };
  }

  const nowIso = new Date().toISOString();
  const newRecord: ApplicationRecord = {
    id: `app_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    jobId: job.id,
    jobTitle: job.title,
    company: job.company,
    location: job.location,
    sourceUrl: job.source_url,
    applicationDate: nowIso,
    updatedAt: nowIso,
    status: "tracked",
    notes: notes || undefined,
    candidateName: candidateName || "Candidate",
  };

  const validation = ApplicationRecordSchema.safeParse(newRecord);
  if (!validation.success) {
    return {
      success: false,
      error: "Application record validation failed.",
      externalNotice: "Internal error creating application record.",
    };
  }

  // 2. Persist in PostgreSQL if configured (and not explicitly overridden by customStoragePath in tests)
  if (isPostgresConfigured() && !customStoragePath) {
    try {
      const dbResult = await pgInsertApplication(validation.data);
      if (dbResult.duplicate) {
        const existing = dbResult.existingRecord || validation.data;
        return {
          success: false,
          alreadyApplied: true,
          record: existing,
          error: `You have already recorded an application for "${job.title}" at ${job.company} on ${new Date(existing.applicationDate).toLocaleDateString()}.`,
          externalNotice: `Duplicate prevented at database level. This application is already tracked. Official listing: ${job.source_url}`,
        };
      }

      if (!dbResult.success) {
        return {
          success: false,
          error: dbResult.error || "Database error saving application.",
          externalNotice: "Database operation failed.",
        };
      }

      return {
        success: true,
        alreadyApplied: false,
        record: dbResult.record,
        externalNotice: `Application tracked in CareerPilot AI. NOTE: This application is recorded in your persistent tracker. To submit your credentials directly to ${job.company}, visit their official listing at: ${job.source_url}`,
      };
    } catch (dbErr) {
      console.error("[ApplicationStore] Database error during insert, falling back to local file:", dbErr);
    }
  }

  // 3. Local File Fallback (or test customStoragePath)
  let outputResult!: ApplicationSubmissionResult;

  writeQueue = writeQueue.then(async () => {
    const existingRecords = readApplications(customStoragePath);

    // Duplicate Prevention Check
    const alreadyAppliedRecord = existingRecords.find((r) => r.jobId === job.id);
    if (alreadyAppliedRecord) {
      outputResult = {
        success: false,
        alreadyApplied: true,
        record: alreadyAppliedRecord,
        error: `You have already recorded an application for "${job.title}" at ${job.company} on ${new Date(alreadyAppliedRecord.applicationDate).toLocaleDateString()}.`,
        externalNotice: `Duplicate prevented. This application is already tracked. Official listing: ${job.source_url}`,
      };
      return;
    }

    // Persist
    existingRecords.push(validation.data);
    await atomicWriteApplications(existingRecords, customStoragePath);

    outputResult = {
      success: true,
      alreadyApplied: false,
      record: validation.data,
      externalNotice: `Application tracked in CareerPilot AI. NOTE: This application is recorded in your local assistant tracker. To submit your credentials directly to ${job.company}, visit their official listing at: ${job.source_url}`,
    };
  });

  await writeQueue;
  return outputResult;
}

/**
 * Lists all recorded applications joined with corresponding job listings.
 * Uses PostgreSQL if configured, otherwise falls back to local file.
 */
export async function listApplications(
  customStoragePath?: string,
  customJobs?: JobListing[]
): Promise<Array<ApplicationRecord & { jobListing?: JobListing }>> {
  let records: ApplicationRecord[] = [];

  if (isPostgresConfigured() && !customStoragePath) {
    try {
      records = await pgGetApplications();
    } catch (err) {
      console.error("[ApplicationStore] Failed to fetch applications from PostgreSQL:", err);
      records = readApplications(customStoragePath);
    }
  } else {
    records = readApplications(customStoragePath);
  }

  const jobs = customJobs || getJobDataset();
  const jobsMap = new Map<string, JobListing>(jobs.map((j) => [j.id, j]));

  return records.map((record) => ({
    ...record,
    jobListing: jobsMap.get(record.jobId),
  }));
}

/**
 * Updates an application status (e.g. "tracked" -> "submitted")
 */
export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus,
  notes?: string,
  customStoragePath?: string
): Promise<ApplicationRecord | null> {
  if (isPostgresConfigured() && !customStoragePath) {
    try {
      return await pgUpdateApplicationStatus(id, status, notes);
    } catch (err) {
      console.error("[ApplicationStore] Failed to update application in PostgreSQL:", err);
    }
  }

  let updatedRecord: ApplicationRecord | null = null;
  writeQueue = writeQueue.then(async () => {
    const existing = readApplications(customStoragePath);
    const idx = existing.findIndex((r) => r.id === id);
    if (idx === -1) return;

    existing[idx].status = status;
    existing[idx].updatedAt = new Date().toISOString();
    if (notes) existing[idx].notes = notes;

    await atomicWriteApplications(existing, customStoragePath);
    updatedRecord = existing[idx];
  });

  await writeQueue;
  return updatedRecord;
}
