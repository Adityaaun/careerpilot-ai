import { z } from "zod";

export const JobListingSchema = z.object({
  id: z.string().min(1, "Job ID is required"),
  title: z.string().min(1, "Job title is required"),
  company: z.string().min(1, "Company name is required"),
  location: z.string().min(1, "Location is required"),
  experience_required: z.string().default("Not specified"),
  skills: z.array(z.string()).default([]),
  description: z.string().min(1, "Description is required"),
  source_url: z.string().url("Must be a valid source URL"),
  remote: z.boolean().default(false),
  source: z.string().default("arbeitnow"),
  posted_at: z.string().optional(),
});

export type JobListing = z.infer<typeof JobListingSchema>;

export interface JobMatchResult {
  job: JobListing;
  matchScore: number; // 0 to 100
  matchedSkills: string[];
  missingSkills: string[];
  matchReason: string;
}

export interface JobFilterCriteria {
  query?: string;
  skills?: string[];
  remoteOnly?: boolean;
  location?: string;
  minExperienceYears?: number;
  maxExperienceYears?: number;
  experienceLevel?: string;
  minScore?: number;
  limit?: number;
}
