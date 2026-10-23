import { Pool, PoolClient } from "pg";
import { ApplicationRecord, ApplicationStatus } from "../types/application";

let pool: Pool | null = null;
let schemaInitialized = false;
const initializedPools = new WeakSet<Pool>();

/**
 * Returns a pooled PostgreSQL client using DATABASE_URL if configured.
 */
export function getPool(): Pool | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString.trim().length === 0) {
    return null;
  }

  if (!pool) {
    const isLocal =
      connectionString.includes("localhost") ||
      connectionString.includes("127.0.0.1");

    pool = new Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 6000,
    });

    pool.on("error", (err) => {
      console.error("[PostgreSQL Pool Error]:", err.message);
    });
  }

  return pool;
}

/**
 * Checks if a PostgreSQL connection string is configured in environment variables.
 */
export function isPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

/**
 * Actively checks whether the PostgreSQL database is reachable and accepting queries.
 */
export async function testPostgresConnection(customPool?: Pool): Promise<{ ok: boolean; error?: string }> {
  if (!customPool && !isPostgresConfigured()) {
    return { ok: false, error: "DATABASE_URL is not set" };
  }
  const p = customPool || getPool();
  if (!p) {
    return { ok: false, error: "PostgreSQL pool failed to initialize" };
  }

  let client: PoolClient | null = null;
  try {
    client = await p.connect();
    const res = await client.query("SELECT 1 as health_check;");
    return { ok: Boolean(res.rows && res.rows.length > 0) };
  } catch (err) {
    const message = (err as Error).message || String(err);
    console.error("[PostgreSQL Health Check Error]:", message);
    return { ok: false, error: message };
  } finally {
    if (client) client.release();
  }
}

/**
 * Automatically creates the applications table and indexes if not present.
 * Uses composite UNIQUE(user_id, job_id) so multiple users can track the same job independently,
 * while maintaining duplicate prevention within a user's scope.
 */
export async function ensurePostgresSchema(customPool?: Pool): Promise<void> {
  if (customPool) {
    if (initializedPools.has(customPool)) return;
  } else if (schemaInitialized) {
    return;
  }
  const p = customPool || getPool();
  if (!p) return;

  let client: PoolClient | null = null;
  try {
    client = await p.connect();

    // 1. Create table with user_id support
    await client.query(`
      CREATE TABLE IF NOT EXISTS applications (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(128) NOT NULL DEFAULT 'demo_user',
        job_id VARCHAR(128) NOT NULL,
        job_title VARCHAR(256) NOT NULL,
        company VARCHAR(256) NOT NULL,
        location VARCHAR(256) NOT NULL DEFAULT 'Remote',
        source_url TEXT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'tracked',
        notes TEXT,
        candidate_name VARCHAR(128) DEFAULT 'Candidate',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Safe migration: add user_id column if upgrading an older table, and ensure composite unique constraint
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'applications' AND column_name = 'user_id'
        ) THEN
          ALTER TABLE applications ADD COLUMN user_id VARCHAR(128) NOT NULL DEFAULT 'demo_user';
        END IF;

        IF EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'unique_job_application'
        ) THEN
          ALTER TABLE applications DROP CONSTRAINT unique_job_application;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_job_application'
        ) THEN
          ALTER TABLE applications ADD CONSTRAINT unique_user_job_application UNIQUE (user_id, job_id);
        END IF;
      END $$;
    `);

    // 3. Performance indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_applications_user_job ON applications(user_id, job_id);
      CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);
    `);

    if (customPool) {
      initializedPools.add(customPool);
    } else {
      schemaInitialized = true;
    }
  } catch (err) {
    console.error("[PostgreSQL Schema Init Error]:", (err as Error).message);
    throw err;
  } finally {
    if (client) client.release();
  }
}

function mapRowToRecord(row: Record<string, unknown>): ApplicationRecord {
  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : "demo_user",
    jobId: String(row.job_id),
    jobTitle: String(row.job_title),
    company: String(row.company),
    location: String(row.location || "Remote"),
    sourceUrl: String(row.source_url),
    applicationDate: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    status: (row.status as ApplicationStatus) || "tracked",
    notes: row.notes ? String(row.notes) : undefined,
    candidateName: row.candidate_name ? String(row.candidate_name) : "Candidate",
  };
}

/**
 * Fetches all tracked applications for a given user from PostgreSQL, ordered by newest first.
 */
/**
 * Fetches all tracked applications for a given user from PostgreSQL, ordered by newest first.
 */
export async function pgGetApplications(userId = "demo_user", customPool?: Pool): Promise<ApplicationRecord[]> {
  await ensurePostgresSchema(customPool);
  const p = customPool || getPool();
  if (!p) throw new Error("PostgreSQL pool not available");

  const result = await p.query(
    "SELECT * FROM applications WHERE user_id = $1 OR user_id = 'demo_user' ORDER BY created_at DESC",
    [userId]
  );
  return result.rows.map(mapRowToRecord);
}

/**
 * Finds an application by job_id and user_id to check for duplicates.
 */
export async function pgGetApplicationByJobId(
  jobId: string,
  userId = "demo_user",
  customPool?: Pool
): Promise<ApplicationRecord | null> {
  await ensurePostgresSchema(customPool);
  const p = customPool || getPool();
  if (!p) throw new Error("PostgreSQL pool not available");

  const result = await p.query(
    "SELECT * FROM applications WHERE (user_id = $1 OR user_id = 'demo_user') AND job_id = $2 LIMIT 1",
    [userId, jobId]
  );
  if (result.rows.length === 0) return null;
  return mapRowToRecord(result.rows[0]);
}

/**
 * Inserts a new application record with database-level uniqueness enforcement per user.
 */
export async function pgInsertApplication(
  record: ApplicationRecord,
  userId = "demo_user",
  customPool?: Pool
): Promise<{
  success: boolean;
  duplicate?: boolean;
  existingRecord?: ApplicationRecord;
  record?: ApplicationRecord;
  error?: string;
}> {
  await ensurePostgresSchema(customPool);
  const p = customPool || getPool();
  if (!p) throw new Error("PostgreSQL pool not available");

  const targetUserId = record.userId || userId || "demo_user";

  try {
    const query = `
      INSERT INTO applications (
        id, user_id, job_id, job_title, company, location, source_url, status, notes, candidate_name, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const createdAt = record.applicationDate ? new Date(record.applicationDate) : new Date();
    const updatedAt = record.updatedAt ? new Date(record.updatedAt) : createdAt;

    const values = [
      record.id,
      targetUserId,
      record.jobId,
      record.jobTitle,
      record.company,
      record.location || "Remote",
      record.sourceUrl,
      record.status || "tracked",
      record.notes || null,
      record.candidateName || "Candidate",
      createdAt,
      updatedAt,
    ];

    const result = await p.query(query, values);
    return {
      success: true,
      duplicate: false,
      record: mapRowToRecord(result.rows[0]),
    };
  } catch (err: unknown) {
    const errorObj = err as { code?: string; message?: string };
    // PostgreSQL error code 23505 = unique_violation
    if (errorObj?.code === "23505") {
      const existing = await pgGetApplicationByJobId(record.jobId, targetUserId, customPool);
      return {
        success: false,
        duplicate: true,
        existingRecord: existing || undefined,
        error: `Application for job ${record.jobId} already exists in database for this user.`,
      };
    }
    return {
      success: false,
      error: `Database insertion error: ${errorObj?.message || String(err)}`,
    };
  }
}

/**
 * Updates an application's status in the database.
 */
export async function pgUpdateApplicationStatus(
  id: string,
  status: ApplicationStatus,
  notes?: string,
  userId = "demo_user",
  customPool?: Pool
): Promise<ApplicationRecord | null> {
  await ensurePostgresSchema(customPool);
  const p = customPool || getPool();
  if (!p) throw new Error("PostgreSQL pool not available");

  const query = `
    UPDATE applications
    SET status = $1, notes = COALESCE($2, notes), updated_at = NOW()
    WHERE id = $3 AND (user_id = $4 OR user_id = 'demo_user')
    RETURNING *
  `;
  const result = await p.query(query, [status, notes || null, id, userId]);
  if (result.rows.length === 0) return null;
  return mapRowToRecord(result.rows[0]);
}

/**
 * Deletes an application record from the database.
 */
export async function pgDeleteApplication(id: string, userId = "demo_user", customPool?: Pool): Promise<boolean> {
  await ensurePostgresSchema(customPool);
  const p = customPool || getPool();
  if (!p) throw new Error("PostgreSQL pool not available");

  const result = await p.query(
    "DELETE FROM applications WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  return (result.rowCount ?? 0) > 0;
}
