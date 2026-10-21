import fs from "fs";
import path from "path";
import { JobListingSchema, JobListing } from "../src/lib/types/job";

interface ValidationReport {
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  duplicateIds: number;
  duplicateContentKeys: number;
  remoteCount: number;
  sources: Record<string, number>;
  errors: Array<{ index: number; id?: string; issues: string[] }>;
}

export function validateJobDataset(filePath: string): { isValid: boolean; report: ValidationReport } {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Dataset file not found at: ${resolvedPath}`);
  }

  const rawData = fs.readFileSync(resolvedPath, "utf-8");
  let records: unknown[];
  try {
    records = JSON.parse(rawData);
  } catch (err) {
    throw new Error(`Failed to parse JSON in ${resolvedPath}: ${(err as Error).message}`);
  }

  if (!Array.isArray(records)) {
    throw new Error(`Expected JSON array of job listings, received ${typeof records}`);
  }

  const report: ValidationReport = {
    totalRecords: records.length,
    validRecords: 0,
    invalidRecords: 0,
    duplicateIds: 0,
    duplicateContentKeys: 0,
    remoteCount: 0,
    sources: {},
    errors: [],
  };

  const seenIds = new Set<string>();
  const seenContentKeys = new Set<string>();

  records.forEach((raw, index) => {
    const parseResult = JobListingSchema.safeParse(raw);
    if (!parseResult.success) {
      report.invalidRecords++;
      const issues = parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      report.errors.push({
        index,
        id: (raw as Record<string, unknown>)?.id as string | undefined,
        issues,
      });
      return;
    }

    const job = parseResult.data as JobListing;

    // Check duplicate ID
    if (seenIds.has(job.id)) {
      report.duplicateIds++;
    } else {
      seenIds.add(job.id);
    }

    // Check duplicate content key (title + company + source_url)
    const contentKey = `${job.title.toLowerCase().trim()}|${job.company.toLowerCase().trim()}|${job.source_url.trim()}`;
    if (seenContentKeys.has(contentKey)) {
      report.duplicateContentKeys++;
    } else {
      seenContentKeys.add(contentKey);
    }

    if (job.remote) {
      report.remoteCount++;
    }

    report.sources[job.source] = (report.sources[job.source] || 0) + 1;
    report.validRecords++;
  });

  const isValid =
    report.invalidRecords === 0 &&
    report.duplicateIds === 0 &&
    report.validRecords > 0;

  return { isValid, report };
}

// Direct execution CLI runner
if (require.main === module || process.argv[1]?.includes("validate_jobs")) {
  const targetFile = process.argv[2] || "./data/jobs.json";
  console.log(`\n======================================================`);
  console.log(`🔍 CareerPilot AI Dataset Validation: ${targetFile}`);
  console.log(`======================================================\n`);

  try {
    const { isValid, report } = validateJobDataset(targetFile);

    console.log(`📊 Total Records Read:         ${report.totalRecords}`);
    console.log(`✅ Valid Listings:            ${report.validRecords}`);
    console.log(`❌ Invalid Listings:          ${report.invalidRecords}`);
    console.log(`⚠️  Duplicate IDs:             ${report.duplicateIds}`);
    console.log(`⚠️  Duplicate Content Keys:    ${report.duplicateContentKeys}`);
    console.log(`🌐 Remote Listings:           ${report.remoteCount}`);
    console.log(`📦 Sources Breakdown:         ${JSON.stringify(report.sources, null, 2)}`);

    if (report.errors.length > 0) {
      console.log(`\nSample Validation Errors (first 5):`);
      report.errors.slice(0, 5).forEach((e) => {
        console.log(` - Record #${e.index} [ID: ${e.id || "N/A"}]: ${e.issues.join(", ")}`);
      });
    }

    console.log(`\n------------------------------------------------------`);
    if (isValid) {
      console.log(`✨ Status: PASSED (Schema conforms with zero invalid records or duplicate IDs)`);
      if (report.validRecords < 1500) {
        console.log(`ℹ️  Note: Current verified count is ${report.validRecords} (Development dataset). Full collection target is 1,500-2,000 for Phase 2.`);
      } else {
        console.log(`🎯 Target Reached: Dataset meets the 1,500-2,000 requirement with ${report.validRecords} listings!`);
      }
      console.log(`------------------------------------------------------\n`);
      process.exit(0);
    } else {
      console.error(`💥 Status: FAILED (Found schema violations or duplicate identifiers)`);
      console.log(`------------------------------------------------------\n`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`💥 Fatal Validation Error: ${(error as Error).message}\n`);
    process.exit(1);
  }
}
