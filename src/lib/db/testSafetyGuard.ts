/**
 * Database Safety Guard for PostgreSQL Integration Tests
 *
 * Enforces strict separation between runtime and integration-test databases.
 * Guarantees that integration tests NEVER fall back to DATABASE_URL and NEVER
 * run destructive schema or data mutations against production instances.
 */

export interface DatabaseSafetyResult {
  safe: boolean;
  reason?: string;
  targetDetails?: {
    host: string;
    port: string;
    database: string;
    isLocal: boolean;
  };
}

/**
 * Validates whether a given TEST_DATABASE_URL is safe to use for integration tests.
 *
 * Rules:
 * 1. TEST_DATABASE_URL must be explicitly provided and non-empty.
 * 2. It must be a valid, syntactically well-formed PostgreSQL URL.
 * 3. It must NEVER match the runtime DATABASE_URL target (host + port + database).
 * 4. It must not target clearly designated production hosts or databases.
 * 5. It must never fall back to DATABASE_URL under any circumstances.
 */
export function validateTestDatabaseSafety(
  testUrl?: string | null,
  runtimeUrl?: string | null
): DatabaseSafetyResult {
  // 1. Missing or empty check
  if (!testUrl || testUrl.trim().length === 0) {
    return {
      safe: false,
      reason:
        "TEST_DATABASE_URL is not set or empty. Integration tests fail closed to prevent accidental execution against production. " +
        "Set TEST_DATABASE_URL to an explicit disposable test database (e.g. postgresql://postgres:postgres@localhost:5432/careerpilot_test).",
    };
  }

  const trimmedTest = testUrl.trim();

  // 2. Syntax & protocol parsing
  let testParsed: URL;
  try {
    testParsed = new URL(trimmedTest);
  } catch {
    return {
      safe: false,
      reason: "TEST_DATABASE_URL is syntactically malformed and could not be parsed as a valid URL.",
    };
  }

  const protocol = testParsed.protocol.toLowerCase();
  if (protocol !== "postgres:" && protocol !== "postgresql:") {
    return {
      safe: false,
      reason: `TEST_DATABASE_URL has an invalid protocol "${protocol}". Expected "postgresql:" or "postgres:".`,
    };
  }

  const testHost = testParsed.hostname.toLowerCase();
  const testPort = testParsed.port || "5432";
  const testDb = testParsed.pathname.replace(/^\//, "").toLowerCase();

  if (!testHost) {
    return {
      safe: false,
      reason: "TEST_DATABASE_URL does not specify a valid host.",
    };
  }

  const isLocal =
    testHost === "localhost" ||
    testHost === "127.0.0.1" ||
    testHost === "::1" ||
    testHost.endsWith(".local") ||
    testHost === "postgres" ||
    testHost === "db";

  // 3. Compare with runtime DATABASE_URL if present
  if (runtimeUrl && runtimeUrl.trim().length > 0) {
    try {
      const runtimeParsed = new URL(runtimeUrl.trim());
      const runtimeHost = runtimeParsed.hostname.toLowerCase();
      const runtimePort = runtimeParsed.port || "5432";
      const runtimeDb = runtimeParsed.pathname.replace(/^\//, "").toLowerCase();

      // If host, port, and database name are identical, reject immediately
      if (
        testHost === runtimeHost &&
        testPort === runtimePort &&
        testDb === runtimeDb
      ) {
        return {
          safe: false,
          reason: `SAFETY GUARD REJECTION: TEST_DATABASE_URL targets the same host (${testHost}:${testPort}) and database ("${testDb}") as DATABASE_URL. Integration tests cannot target the runtime database.`,
        };
      }
    } catch {
      // If runtime URL is malformed, ignore runtime comparison but continue other checks
    }
  }

  // 4. Reject clearly production-designated targets and managed cloud endpoints
  const isManagedCloud =
    testHost.includes("neon.tech") ||
    testHost.includes("supabase.co") ||
    testHost.includes("rds.amazonaws.com") ||
    testHost.includes("render.com") ||
    testHost.includes("elephantsql.com") ||
    testHost.includes("postgres.database.azure.com");

  if (isManagedCloud) {
    return {
      safe: false,
      reason: `SAFETY GUARD REJECTION: TEST_DATABASE_URL targets a managed cloud database host (${testHost}). Integration tests require a dedicated disposable database (e.g. local Docker container).`,
    };
  }

  // Reject production keywords in database name or query params
  if (
    testDb.includes("prod") ||
    testDb.includes("production") ||
    testDb === "neondb" ||
    testHost.includes("prod") ||
    testHost.includes("production")
  ) {
    return {
      safe: false,
      reason: `SAFETY GUARD REJECTION: Target database or host ("${testHost}/${testDb}") contains production identifiers.`,
    };
  }

  return {
    safe: true,
    targetDetails: {
      host: testHost,
      port: testPort,
      database: testDb,
      isLocal,
    },
  };
}
