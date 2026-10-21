import { describe, it, expect } from "vitest";
import { validateJobDataset } from "../scripts/validate_jobs";

describe("Dataset Validation Harness", () => {
  it("validates the seed development dataset successfully", () => {
    const { isValid, report } = validateJobDataset("./data/jobs.json");
    expect(isValid).toBe(true);
    expect(report.validRecords).toBeGreaterThan(0);
    expect(report.invalidRecords).toBe(0);
    expect(report.duplicateIds).toBe(0);
  });
});
