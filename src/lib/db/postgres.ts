import { Pool, PoolClient } from "pg";
import { ApplicationRecord, ApplicationStatus } from "../types/application";

let pool: Pool | null = null;
let schemaInitialized = false;

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
 * Checks if a real PostgreSQL database is configured.
 */
export function isPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

/**
 * Automatically creates the applications table and unique constraints if not present.
 */
export async function ensurePostgresSchema(): Promise<void> {
  if (schemaInitialized) return;
  const p = getPool();
  if (!p) return;

  let client: PoolClient | null = null;
  try {
    client = await p.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS applications (
        id VARCHAR(64) PRIMARY KEY,
        job_id VARCHAR(128) NOT NULL,
        job_title VARCHAR(256) NOT NULL,
        company VARCHAR(256) NOT NULL,
        location VARCHAR(256) NOT NULL DEFAULT 'Remote',
        source_url TEXT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'tracked',
        notes TEXT,
        candidate_name VARCHAR(128) DEFAULT 'Candidate',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT unique_job_application UNIQUE (job_id)
      );

      CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
      CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);
    `);
    schemaInitialized = true;
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
 * Fetches all tracked applications from PostgreSQL, ordered by newest first.
 */
export async function pgGetApplications(): Promise<ApplicationRecord[]> {
  await ensurePostgresSchema();
  const p = getPool();
  if (!p) throw new Error("PostgreSQL pool not available");

  const result = await p.query(
    "SELECT * FROM applications ORDER BY created_at DESC"
  );
  return result.rows.map(mapRowToRecord);
}

/**
 * Finds an application by job_id to check for duplicates.
 */
export async function pgGetApplicationByJobId(jobId: string): Promise<ApplicationRecord | null> {
  await ensurePostgresSchema();
  const p = getPool();
  if (!p) throw new Error("PostgreSQL pool not available");

  const result = await p.query(
    "SELECT * FROM applications WHERE job_id = $1 LIMIT 1",
    [jobId]
  );
  if (result.rows.length === 0) return null;
  return mapRowToRecord(result.rows[0]);
}

/**
 * Inserts a new application record with database-level uniqueness enforcement.
 */
export async function pgInsertApplication(
  record: ApplicationRecord
): Promise<{
  success: boolean;
  duplicate?: boolean;
  existingRecord?: ApplicationRecord;
  record?: ApplicationRecord;
  error?: string;
}> {
  await ensurePostgresSchema();
  const p = getPool();
  if (!p) throw new Error("PostgreSQL pool not available");

  try {
    const query = `
      INSERT INTO applications (
        id, job_id, job_title, company, location, source_url, status, notes, candidate_name, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const createdAt = record.applicationDate ? new Date(record.applicationDate) : new Date();
    const updatedAt = record.updatedAt ? new Date(record.updatedAt) : createdAt;

    const values = [
      record.id,
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
      const existing = await pgGetApplicationByJobId(record.jobId);
      return {
        success: false,
        duplicate: true,
        existingRecord: existing || undefined,
        error: `Application for job ${record.jobId} already exists in database.`,
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
  notes?: string
): Promise<ApplicationRecord | null> {
  await ensurePostgresSchema();
  const p = getPool();
  if (!p) throw new Error("PostgreSQL pool not available");

  const query = `
    UPDATE applications
    SET status = $1, notes = COALESCE($2, notes), updated_at = NOW()
    WHERE id = $3
    RETURNING *
  `;
  const result = await p.query(query, [status, notes || null, id]);
  if (result.rows.length === 0) return null;
  return mapRowToRecord(result.rows[0]);
}

/**
 * Deletes an application record from the database.
 */
export async function pgDeleteApplication(id: string): Promise<boolean> {
  await ensurePostgresSchema();
  const p = getPool();
  if (!p) throw new Error("PostgreSQL pool not available");

  const result = await p.query("DELETE FROM applications WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}
