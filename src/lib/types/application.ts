import { z } from "zod";

export const ApplicationStatusSchema = z.enum([
  "tracked",
  "submitted",
  "under_review",
  "interviewing",
  "rejected",
  "offered",
]);

export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

export const ApplicationRecordSchema = z.object({
  id: z.string(), // application unique record id (e.g. app_1234567890)
  jobId: z.string().min(1, "Job ID is required"),
  jobTitle: z.string().min(1, "Job title is required"),
  company: z.string().min(1, "Company name is required"),
  location: z.string().default("Remote"),
  sourceUrl: z.string().url("Must be valid URL"),
  applicationDate: z.string(), // ISO string date (created_at)
  updatedAt: z.string().optional(), // ISO string date
  status: ApplicationStatusSchema.default("tracked"),
  notes: z.string().optional(),
  candidateName: z.string().optional(),
});

export type ApplicationRecord = z.infer<typeof ApplicationRecordSchema>;

export interface ApplicationSubmissionResult {
  success: boolean;
  record?: ApplicationRecord;
  alreadyApplied?: boolean;
  error?: string;
  externalNotice: string;
}
