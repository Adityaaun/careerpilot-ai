import fs from "fs";
import path from "path";
import {
  ApplicationRecord,
  ApplicationRecordSchema,
  ApplicationSubmissionResult,
} from "../types/application";
import { JobListing } from "../types/job";
import { getJobDataset } from "./jobMatcher";

// In-process write lock queue to serialize concurrent operations safely
let writeQueue: Promise<unknown> = Promise.resolve();

function getStoragePath(customPath?: string): string {
  if (customPath) {
    return path.resolve(customPath);
  }
  return path.join(process.cwd(), "data", "applications.json");
}

/**
 * Safely reads and validates application records from storage
 */
export function readApplications(customPath?: string): ApplicationRecord[] {
  const filePath = getStoragePath(customPath);

  if (!fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) {
      fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
    }
    fs.writeFileSync(/*turbopackIgnore: true*/ filePath, "[]", "utf-8");
    return [];
  }

  const raw = fs.readFileSync(/*turbopackIgnore: true*/ filePath, "utf-8").trim();
  if (!raw) return [];

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

  return validRecords;
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

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const serialized = JSON.stringify(records, null, 2);
  await fs.promises.writeFile(tempPath, serialized, "utf-8");
  await fs.promises.rename(tempPath, filePath);
}

/**
 * Records a new application for a job with duplicate prevention and validation
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

  // Synchronize entire critical section through writeQueue to prevent race conditions
  let outputResult!: ApplicationSubmissionResult;

  writeQueue = writeQueue.then(async () => {
    // 2. Read existing records inside the synchronized critical section
    const existingRecords = readApplications(customStoragePath);

    // 3. Duplicate Prevention Check
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

    // 4. Construct validated ApplicationRecord
    const newRecord: ApplicationRecord = {
      id: `app_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      jobId: job.id,
      jobTitle: job.title,
      company: job.company,
      location: job.location,
      sourceUrl: job.source_url,
      applicationDate: new Date().toISOString(),
      status: "tracked",
      notes: notes || undefined,
      candidateName: candidateName || "Candidate",
    };

    const validation = ApplicationRecordSchema.safeParse(newRecord);
    if (!validation.success) {
      outputResult = {
        success: false,
        error: "Application record validation failed.",
        externalNotice: "Internal error creating application record.",
      };
      return;
    }

    // 5. Atomic Persist
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
 * Lists all recorded applications joined with corresponding job listings
 */
export function listApplications(
  customStoragePath?: string,
  customJobs?: JobListing[]
): Array<ApplicationRecord & { jobListing?: JobListing }> {
  const records = readApplications(customStoragePath);
  const jobs = customJobs || getJobDataset();
  const jobsMap = new Map<string, JobListing>(jobs.map((j) => [j.id, j]));

  return records.map((record) => ({
    ...record,
    jobListing: jobsMap.get(record.jobId),
  }));
}
