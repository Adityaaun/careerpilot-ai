import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import {
  ensurePostgresSchema,
  pgInsertApplication,
  pgGetApplications,
  pgUpdateApplicationStatus,
  pgDeleteApplication,
  testPostgresConnection,
} from "../src/lib/db/postgres";
import { checkStorageHealth } from "../src/lib/tools/applicationStore";
import { ApplicationRecord } from "../src/lib/types/application";
import { JobListing } from "../src/lib/types/job";

const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const hasRealDb = Boolean(testDbUrl && testDbUrl.trim().length > 0);

describe("PostgreSQL Integration & Concurrency Test Suite (Phase 7)", () => {
  if (!hasRealDb) {
    it("reports PostgreSQL integration tests as BLOCKED when no database credentials exist", () => {
      console.warn(
        "\n[PostgreSQL Integration] ⚠️ BLOCKED: Neither TEST_DATABASE_URL nor DATABASE_URL is configured in environment." +
        "\nTo execute real integration tests against a disposable PostgreSQL instance, set TEST_DATABASE_URL=<connection-string>.\n"
      );
      expect(hasRealDb).toBe(false);
    });

    it("verifies honest storage health reporting when DATABASE_URL is absent", async () => {
      const health = await checkStorageHealth();
      expect(health.backend).toBe("local_fallback");
      expect(health.isPersistent).toBe(false);
      expect(health.connected).toBe(false);
      expect(health.message).toContain("Demo mode: Local filesystem fallback");
    });

    return;
  }

  // --- Real PostgreSQL Database Execution Branch ---
  let directPool: Pool;
  const testUserId = `test_user_${Date.now()}`;
  const testJobId = `job_test_pg_${Date.now()}`;
  const createdAppIds: string[] = [];

  const mockDbJob: JobListing = {
    id: testJobId,
    title: "Database Reliability Engineer",
    company: "PostgreSQL Global",
    location: "Remote",
    experience_required: "3-5 years (Mid-Senior)",
    skills: ["PostgreSQL", "SQL", "Docker"],
    description: "Database resilience and integration testing.",
    source_url: "https://example.com/job/pg-test",
    remote: true,
    source: "arbeitnow",
  };

  beforeAll(async () => {
    directPool = new Pool({
      connectionString: testDbUrl,
      ssl: testDbUrl!.includes("localhost") ? false : { rejectUnauthorized: false },
    });
    await ensurePostgresSchema();
  });

  afterAll(async () => {
    // Non-destructive cleanup: only remove specifically created test records
    for (const id of createdAppIds) {
      await pgDeleteApplication(id, testUserId).catch(() => {});
    }
    await directPool.end().catch(() => {});
  });

  it("successfully performs health check against live database", async () => {
    const health = await testPostgresConnection();
    expect(health.ok).toBe(true);
    expect(health.error).toBeUndefined();
  });

  it("inserts application record with schema compliance and user isolation", async () => {
    const testRecord: ApplicationRecord = {
      id: `app_pg_${Date.now()}_1`,
      userId: testUserId,
      jobId: testJobId,
      jobTitle: mockDbJob.title,
      company: mockDbJob.company,
      location: mockDbJob.location,
      sourceUrl: mockDbJob.source_url,
      applicationDate: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "tracked",
      notes: "Initial test entry",
      candidateName: "Integration Tester",
    };

    const res = await pgInsertApplication(testRecord, testUserId);
    expect(res.success).toBe(true);
    expect(res.record).toBeDefined();
    expect(res.record?.id).toBe(testRecord.id);
    expect(res.record?.userId).toBe(testUserId);
    createdAppIds.push(testRecord.id);

    // Verify it appears in user's list
    const userApps = await pgGetApplications(testUserId);
    expect(userApps.some((a) => a.id === testRecord.id)).toBe(true);
  });

  it("enforces duplicate prevention at database level under concurrent insert race conditions", async () => {
    const concurrentJobId = `job_concurrent_${Date.now()}`;
    const recordA: ApplicationRecord = {
      id: `app_conc_${Date.now()}_a`,
      userId: testUserId,
      jobId: concurrentJobId,
      jobTitle: "Concurrent Role A",
      company: "Race Corp",
      location: "Remote",
      sourceUrl: "https://example.com/race",
      applicationDate: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "tracked",
      candidateName: "Racer A",
    };

    const recordB: ApplicationRecord = {
      ...recordA,
      id: `app_conc_${Date.now()}_b`,
      candidateName: "Racer B",
    };

    // Fire both insertions concurrently to simulate simultaneous race condition
    const [resultA, resultB] = await Promise.all([
      pgInsertApplication(recordA, testUserId),
      pgInsertApplication(recordB, testUserId),
    ]);

    // Exactly one insertion MUST succeed and one MUST be flagged as duplicate
    const successes = [resultA, resultB].filter((r) => r.success);
    const duplicates = [resultA, resultB].filter((r) => r.duplicate);

    expect(successes.length).toBe(1);
    expect(duplicates.length).toBe(1);

    if (resultA.success && resultA.record) createdAppIds.push(resultA.record.id);
    if (resultB.success && resultB.record) createdAppIds.push(resultB.record.id);
  });

  it("updates application status in PostgreSQL and persists across queries", async () => {
    const testAppId = createdAppIds[0];
    expect(testAppId).toBeDefined();

    const updated = await pgUpdateApplicationStatus(testAppId, "interviewing", "Round 1 scheduled", testUserId);
    expect(updated).toBeDefined();
    expect(updated?.status).toBe("interviewing");
    expect(updated?.notes).toBe("Round 1 scheduled");

    // Fetch fresh from database and assert
    const freshList = await pgGetApplications(testUserId);
    const match = freshList.find((a) => a.id === testAppId);
    expect(match?.status).toBe("interviewing");
    expect(match?.notes).toBe("Round 1 scheduled");
  });
});
