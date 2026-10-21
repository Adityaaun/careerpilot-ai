import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import {
  recordApplication,
  listApplications,
  updateApplicationStatus,
  getStorageStatus,
} from "../src/lib/tools/applicationStore";
import { JobListing } from "../src/lib/types/job";

const testDbStoragePath = path.resolve("./data/test_db_applications.json");

const mockTestJobs: JobListing[] = [
  {
    id: "job_db_1",
    title: "Senior Backend Engineer",
    company: "Neon Tech",
    location: "Remote",
    experience_required: "3-5 years (Mid-Senior)",
    skills: ["PostgreSQL", "Go", "Docker"],
    description: "Database scale roles.",
    source_url: "https://example.com/job/neon",
    remote: true,
    source: "arbeitnow",
  },
  {
    id: "job_db_2",
    title: "AI Automation Specialist",
    company: "Hidani Tech",
    location: "Berlin",
    experience_required: "1-3 years (Associate / Mid)",
    skills: ["Python", "Agents", "TypeScript"],
    description: "Agent automation roles.",
    source_url: "https://example.com/job/hidani",
    remote: false,
    source: "arbeitnow",
  },
];

describe("Database Persistence & Schema Requirements (Phase 2)", () => {
  beforeEach(() => {
    if (fs.existsSync(testDbStoragePath)) {
      fs.unlinkSync(testDbStoragePath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDbStoragePath)) {
      fs.unlinkSync(testDbStoragePath);
    }
  });

  it("reports accurate storage status without falsely claiming database persistence when DATABASE_URL is unset", () => {
    const status = getStorageStatus();
    expect(status).toBeDefined();
    expect(["postgres", "local_fallback"]).toContain(status.backend);
    if (!process.env.DATABASE_URL) {
      expect(status.isPersistent).toBe(false);
      expect(status.backend).toBe("local_fallback");
    } else {
      expect(status.isPersistent).toBe(true);
      expect(status.backend).toBe("postgres");
    }
  });

  it("persists application records with required schema fields (ID, Job ID, Title, Company, Source URL, Status, Created Date, Updated Date)", async () => {
    const res = await recordApplication(
      { jobId: "job_db_1", candidateName: "Sarah Jenkins", notes: "First choice" },
      testDbStoragePath,
      mockTestJobs
    );

    expect(res.success).toBe(true);
    expect(res.record).toBeDefined();
    const rec = res.record!;

    expect(rec.id).toBeDefined();
    expect(rec.jobId).toBe("job_db_1");
    expect(rec.jobTitle).toBe("Senior Backend Engineer");
    expect(rec.company).toBe("Neon Tech");
    expect(rec.sourceUrl).toBe("https://example.com/job/neon");
    expect(rec.status).toBe("tracked");
    expect(rec.applicationDate).toBeDefined();
    expect(rec.updatedAt).toBeDefined();

    // Verify retrieval across reload
    const stored = await listApplications(testDbStoragePath, mockTestJobs);
    expect(stored.length).toBe(1);
    expect(stored[0].id).toBe(rec.id);
    expect(stored[0].jobId).toBe("job_db_1");
    expect(stored[0].jobListing?.company).toBe("Neon Tech");
  });

  it("enforces duplicate prevention and returns alreadyApplied with original record", async () => {
    // First tracking
    const first = await recordApplication(
      { jobId: "job_db_1" },
      testDbStoragePath,
      mockTestJobs
    );
    expect(first.success).toBe(true);

    // Duplicate tracking attempt
    const second = await recordApplication(
      { jobId: "job_db_1" },
      testDbStoragePath,
      mockTestJobs
    );
    expect(second.success).toBe(false);
    expect(second.alreadyApplied).toBe(true);
    expect(second.record?.jobId).toBe("job_db_1");
    expect(second.error).toContain("already recorded an application");
  });

  it("updates application status and persists across fetches (tracked -> submitted -> interviewing)", async () => {
    const first = await recordApplication(
      { jobId: "job_db_2" },
      testDbStoragePath,
      mockTestJobs
    );
    expect(first.success).toBe(true);
    const appId = first.record!.id;

    // Update status to 'submitted'
    const updated1 = await updateApplicationStatus(appId, "submitted", "Sent via portal", testDbStoragePath);
    expect(updated1).toBeDefined();
    expect(updated1?.status).toBe("submitted");
    expect(updated1?.notes).toBe("Sent via portal");

    // Fetch again and verify persistence of updated status
    const list1 = await listApplications(testDbStoragePath, mockTestJobs);
    expect(list1.find((a) => a.id === appId)?.status).toBe("submitted");

    // Update status to 'interviewing'
    const updated2 = await updateApplicationStatus(appId, "interviewing", undefined, testDbStoragePath);
    expect(updated2?.status).toBe("interviewing");

    const list2 = await listApplications(testDbStoragePath, mockTestJobs);
    expect(list2.find((a) => a.id === appId)?.status).toBe("interviewing");
  });

  it("distinguishes tracked in assistant from external submission", async () => {
    const res = await recordApplication(
      { jobId: "job_db_1" },
      testDbStoragePath,
      mockTestJobs
    );
    expect(res.externalNotice).toContain("NOTE: This application is recorded in your");
    expect(res.externalNotice).toContain("To submit your credentials directly to Neon Tech");
    expect(res.record?.status).toBe("tracked");
  });
});
