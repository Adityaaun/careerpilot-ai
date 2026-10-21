import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  readApplications,
  recordApplication,
  listApplications,
} from "../src/lib/tools/applicationStore";
import { JobListing } from "../src/lib/types/job";

const testStoragePath = path.resolve("./data/test_applications.json");

const mockTestJobs: JobListing[] = [
  {
    id: "job_test_1",
    title: "Full Stack Engineer",
    company: "Test Corp",
    location: "Remote",
    experience_required: "1-3 years",
    skills: ["TypeScript", "React"],
    description: "Great role at Test Corp.",
    source_url: "https://example.com/jobs/1",
    remote: true,
    source: "test",
  },
  {
    id: "job_test_2",
    title: "DevOps Specialist",
    company: "Cloud Operations",
    location: "Berlin",
    experience_required: "3-5 years",
    skills: ["Docker", "Kubernetes"],
    description: "Cloud role.",
    source_url: "https://example.com/jobs/2",
    remote: false,
    source: "test",
  },
];

describe("Application Store Tool", () => {
  beforeEach(() => {
    // Reset test storage file before each test
    if (fs.existsSync(testStoragePath)) {
      fs.unlinkSync(testStoragePath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testStoragePath)) {
      fs.unlinkSync(testStoragePath);
    }
    // Clean up any test backups
    const dir = path.dirname(testStoragePath);
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f.startsWith("test_applications.json.")) {
        fs.unlinkSync(path.join(dir, f));
      }
    }
  });

  it("safely initializes an empty array if storage file does not exist", () => {
    const records = readApplications(testStoragePath);
    expect(records).toEqual([]);
    expect(fs.existsSync(testStoragePath)).toBe(true);
  });

  it("successfully records a new application", async () => {
    const result = await recordApplication(
      { jobId: "job_test_1", notes: "Excited about this role!", candidateName: "Jordan Lee" },
      testStoragePath,
      mockTestJobs
    );

    expect(result.success).toBe(true);
    expect(result.alreadyApplied).toBe(false);
    expect(result.record).toBeDefined();
    expect(result.record?.jobId).toBe("job_test_1");
    expect(result.record?.jobTitle).toBe("Full Stack Engineer");
    expect(result.record?.company).toBe("Test Corp");
    expect(result.record?.status).toBe("tracked");
    expect(result.externalNotice).toContain("Application tracked in CareerPilot AI");

    const saved = readApplications(testStoragePath);
    expect(saved.length).toBe(1);
    expect(saved[0].jobId).toBe("job_test_1");
  });

  it("rejects an invalid or non-existent job ID", async () => {
    const result = await recordApplication(
      { jobId: "non_existent_job_999" },
      testStoragePath,
      mockTestJobs
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("was not found in the verified dataset");

    const saved = readApplications(testStoragePath);
    expect(saved.length).toBe(0);
  });

  it("prevents duplicate applications for the same job", async () => {
    // First submission
    const firstResult = await recordApplication(
      { jobId: "job_test_1" },
      testStoragePath,
      mockTestJobs
    );
    expect(firstResult.success).toBe(true);

    // Second submission for the same job
    const secondResult = await recordApplication(
      { jobId: "job_test_1" },
      testStoragePath,
      mockTestJobs
    );

    expect(secondResult.success).toBe(false);
    expect(secondResult.alreadyApplied).toBe(true);
    expect(secondResult.error).toContain("already recorded an application");
    expect(secondResult.externalNotice).toContain("Duplicate prevented");

    // Total saved records must still remain 1
    const saved = readApplications(testStoragePath);
    expect(saved.length).toBe(1);
  });

  it("lists applications and joins them with job details", async () => {
    await recordApplication({ jobId: "job_test_1" }, testStoragePath, mockTestJobs);
    await recordApplication({ jobId: "job_test_2" }, testStoragePath, mockTestJobs);

    const listed = listApplications(testStoragePath, mockTestJobs);
    expect(listed.length).toBe(2);
    expect(listed[0].jobListing?.title).toBe("Full Stack Engineer");
    expect(listed[1].jobListing?.title).toBe("DevOps Specialist");
  });

  it("quarantines corrupted JSON storage without silently destroying unreadable data", () => {
    fs.writeFileSync(testStoragePath, "{ corrupted json syntax missing brackets: ", "utf-8");

    expect(() => readApplications(testStoragePath)).toThrow(/malformed JSON/);

    // A quarantined backup file should have been created
    const dir = path.dirname(testStoragePath);
    const backups = fs.readdirSync(dir).filter((f) => f.includes("test_applications.json.corrupt"));
    expect(backups.length).toBeGreaterThan(0);
  });

  it("handles concurrent writes safely without race conditions", async () => {
    // Fire concurrent calls to apply to different jobs and test duplicate race condition
    const promise1 = recordApplication({ jobId: "job_test_1" }, testStoragePath, mockTestJobs);
    const promise2 = recordApplication({ jobId: "job_test_1" }, testStoragePath, mockTestJobs); // duplicate
    const promise3 = recordApplication({ jobId: "job_test_2" }, testStoragePath, mockTestJobs);

    const [res1, res2, res3] = await Promise.all([promise1, promise2, promise3]);

    const successes = [res1, res2, res3].filter((r) => r.success);
    const duplicates = [res1, res2, res3].filter((r) => r.alreadyApplied);

    expect(successes.length).toBe(2);
    expect(duplicates.length).toBe(1);

    const saved = readApplications(testStoragePath);
    expect(saved.length).toBe(2);
  });
});
