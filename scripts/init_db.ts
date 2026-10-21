import { ensurePostgresSchema, isPostgresConfigured, getPool } from "../src/lib/db/postgres";

async function main() {
  console.log("=== CareerPilot AI Database Initialization ===");
  if (!isPostgresConfigured()) {
    console.warn("⚠️  DATABASE_URL environment variable is not set.");
    console.warn("   For local testing with PostgreSQL, set:");
    console.warn("   DATABASE_URL=postgresql://username:password@localhost:5432/careerpilot");
    console.warn("   For production with Neon or Supabase on Vercel, set DATABASE_URL in Vercel project settings.");
    process.exit(0);
  }

  console.log("Connecting to PostgreSQL...");
  const pool = getPool();
  if (!pool) {
    throw new Error("Failed to initialize PostgreSQL pool.");
  }

  try {
    const res = await pool.query("SELECT current_database(), current_user, version();");
    console.log("✅ Successfully connected to database:", res.rows[0].current_database);
    console.log("   User:", res.rows[0].current_user);

    console.log("Creating applications table and indexes if not exists...");
    await ensurePostgresSchema();
    console.log("✅ Schema initialized successfully!");

    const countRes = await pool.query("SELECT COUNT(*) FROM applications;");
    console.log(`📊 Current applications count in database: ${countRes.rows[0].count}`);
  } catch (err) {
    console.error("❌ Database initialization error:", (err as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
