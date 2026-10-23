import { describe, it, expect } from "vitest";
import { validateTestDatabaseSafety } from "../src/lib/db/testSafetyGuard";

describe("Database Safety Guard Suite (Phase 2)", () => {
  const dummyRuntimeNeonUrl = "postgresql://myuser:secretpassword@ep-cool-pond-123456.us-east-2.aws.neon.tech/neondb?sslmode=require";
  const dummyRuntimeLocalUrl = "postgresql://postgres:runtimepassword@localhost:5432/careerpilot_dev";

  it("Case 1: Blocks when TEST_DATABASE_URL is missing while DATABASE_URL is set (fails closed)", () => {
    const result = validateTestDatabaseSafety(undefined, dummyRuntimeNeonUrl);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("TEST_DATABASE_URL is not set or empty");
    // Verify it did not fall back to runtime URL
    expect(result.targetDetails).toBeUndefined();
  });

  it("Case 2: Blocks when TEST_DATABASE_URL is blank or whitespace only", () => {
    const result = validateTestDatabaseSafety("   ", dummyRuntimeNeonUrl);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("TEST_DATABASE_URL is not set or empty");
    expect(result.targetDetails).toBeUndefined();
  });

  it("Case 3: Blocks when TEST_DATABASE_URL points to the same target host and database as DATABASE_URL", () => {
    // Same target host & db, even with different credentials or parameters
    const testUrl = "postgresql://otheruser:otherpass@localhost:5432/careerpilot_dev";
    const result = validateTestDatabaseSafety(testUrl, dummyRuntimeLocalUrl);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("SAFETY GUARD REJECTION");
    expect(result.reason).toContain("targets the same host");
  });

  it("Case 4: Blocks clearly production-designated targets (e.g. Neon, Supabase, AWS RDS, prod databases)", () => {
    // 4a: Managed cloud provider (Neon)
    const neonResult = validateTestDatabaseSafety(
      "postgresql://testuser:testpass@ep-demo-branch.neon.tech/neondb",
      dummyRuntimeLocalUrl
    );
    expect(neonResult.safe).toBe(false);
    expect(neonResult.reason).toContain("targets a managed cloud database host");

    // 4b: Supabase cloud host
    const supabaseResult = validateTestDatabaseSafety(
      "postgresql://postgres:secret@db.xyzcompany.supabase.co:5432/postgres",
      undefined
    );
    expect(supabaseResult.safe).toBe(false);
    expect(supabaseResult.reason).toContain("targets a managed cloud database host");

    // 4c: Database or host named 'production' or 'prod'
    const prodDbResult = validateTestDatabaseSafety(
      "postgresql://user:pass@127.0.0.1:5432/company_prod",
      undefined
    );
    expect(prodDbResult.safe).toBe(false);
    expect(prodDbResult.reason).toContain("production identifiers");
  });

  it("Case 5: Blocks syntactically malformed test URLs and invalid protocols", () => {
    // 5a: Malformed string
    const malformed = validateTestDatabaseSafety("not-a-valid-url-string", dummyRuntimeNeonUrl);
    expect(malformed.safe).toBe(false);
    expect(malformed.reason).toContain("malformed");

    // 5b: Invalid protocol (e.g. http or mysql)
    const wrongProtocol = validateTestDatabaseSafety("mysql://user:pass@localhost:3306/testdb", dummyRuntimeNeonUrl);
    expect(wrongProtocol.safe).toBe(false);
    expect(wrongProtocol.reason).toContain("invalid protocol");
  });

  it("Case 6: Passes when valid, separately configured disposable test database URL is provided", () => {
    const validTestUrl = "postgresql://postgres:postgres@localhost:5432/careerpilot_isolated_test";
    const result = validateTestDatabaseSafety(validTestUrl, dummyRuntimeNeonUrl);

    expect(result.safe).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.targetDetails).toBeDefined();
    expect(result.targetDetails?.host).toBe("localhost");
    expect(result.targetDetails?.port).toBe("5432");
    expect(result.targetDetails?.database).toBe("careerpilot_isolated_test");
    expect(result.targetDetails?.isLocal).toBe(true);
  });

  it("Case 7: Guarantees zero fallback to runtime database on any safety validation failure", () => {
    const invalidInputs = [
      undefined,
      "",
      "   ",
      "invalid-url",
      dummyRuntimeNeonUrl, // identical to runtime
    ];

    for (const input of invalidInputs) {
      const result = validateTestDatabaseSafety(input, dummyRuntimeNeonUrl);
      expect(result.safe).toBe(false);
      // No target details should indicate that the runtime database was selected as fallback
      if (result.targetDetails) {
        expect(result.targetDetails.host).not.toContain("neon.tech");
      }
    }
  });
});
