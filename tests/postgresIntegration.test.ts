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
import { validateTestDatabaseSafety } from "../src/lib/db/testSafetyGuard";
import { checkStorageHealth } from "../src/lib/tools/applicationStore";
import { ApplicationRecord } from "../src/lib/types/application";
import { JobListing } from "../src/lib/types/job";

// Strictly require TEST_DATABASE_URL and validate safety. Never fall back to DATABASE_URL.
const testDbUrl = process.env.TEST_DATABASE_URL;
const runtimeDbUrl = process.env.DATABASE_URL;
const safety = validateTestDatabaseSafety(testDbUrl, runtimeDbUrl);
const hasRealDb = safety.safe;

describe("PostgreSQL Integration & Concurrency Test Suite (Phase 7)", () => {
  if (!hasRealDb) {
    it("reports PostgreSQL integration tests as BLOCKED when disposable test database is not configured or rejected by safety guard", () => {
      console.warn(
        `\n[PostgreSQL Integration] ⚠️ BLOCKED: ${safety.reason}\n` +
        "To execute real integration tests against an isolated disposable PostgreSQL instance, set:\n" +
        "TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/careerpilot_test\n" +
        "Safety rule: Integration tests NEVER fall back to DATABASE_URL and NEVER target production hosts.\n"
      );
      expect(hasRealDb).toBe(false);
    });

    it("verifies honest storage health reporting when DATABASE_URL is absent or unconfigured in tests", async () => {
      const health = await checkStorageHealth();
      expect(health.backend).toBe("local_fallback");
      expect(health.isPersistent).toBe(false);
      expect(health.connected).toBe(false);
      expect(health.message).toContain("Demo mode: Local filesystem fallback");
    });

    return;
  }

  // --- Real Isolated PostgreSQL Database Execution Branch ---
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
      connectionString: testDbUrl!,
      ssl: safety.targetDetails?.isLocal ? false : { rejectUnauthorized: false },
    });
    // Schema initialized explicitly on the dedicated test connection pool
    await ensurePostgresSchema(directPool);
  });

  afterAll(async () => {
    // Non-destructive cleanup: only remove specifically created test records on the isolated test database
    for (const id of createdAppIds) {
      await pgDeleteApplication(id, testUserId, directPool).catch(() => {});
    }
    await directPool.end().catch(() => {});
  });

  it("successfully performs health check against live isolated test database", async () => {
    const health = await testPostgresConnection(directPool);
    expect(health.ok).toBe(true);
    expect(health.error).toBeUndefined();
  });

  it("inserts application record with schema compliance and user isolation into test database", async () => {
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

    const res = await pgInsertApplication(testRecord, testUserId, directPool);
    expect(res.success).toBe(true);
    expect(res.record).toBeDefined();
    expect(res.record?.id).toBe(testRecord.id);
    expect(res.record?.userId).toBe(testUserId);
    createdAppIds.push(testRecord.id);

    // Verify it appears in user's list in test database
    const userApps = await pgGetApplications(testUserId, directPool);
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

    // Fire both insertions concurrently to simulate simultaneous race condition against test database
    const [resultA, resultB] = await Promise.all([
      pgInsertApplication(recordA, testUserId, directPool),
      pgInsertApplication(recordB, testUserId, directPool),
    ]);

    // Exactly one insertion MUST succeed and one MUST be flagged as duplicate
    const successes = [resultA, resultB].filter((r) => r.success);
    const duplicates = [resultA, resultB].filter((r) => r.duplicate);

    expect(successes.length).toBe(1);
    expect(duplicates.length).toBe(1);

    if (resultA.success && resultA.record) createdAppIds.push(resultA.record.id);
    if (resultB.success && resultB.record) createdAppIds.push(resultB.record.id);
  });

  it("updates application status in PostgreSQL and persists across queries in test database", async () => {
    const testAppId = createdAppIds[0];
    expect(testAppId).toBeDefined();

    const updated = await pgUpdateApplicationStatus(testAppId, "interviewing", "Round 1 scheduled", testUserId, directPool);
    expect(updated).toBeDefined();
    expect(updated?.status).toBe("interviewing");
    expect(updated?.notes).toBe("Round 1 scheduled");

    // Fetch fresh from isolated test database and assert
    const freshList = await pgGetApplications(testUserId, directPool);
    const match = freshList.find((a) => a.id === testAppId);
    expect(match?.status).toBe("interviewing");
    expect(match?.notes).toBe("Round 1 scheduled");
  });
});
