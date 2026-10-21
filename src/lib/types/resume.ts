import { z } from "zod";

export const ContactDetailsSchema = z.object({
  email: z.string().email().optional().or(z.literal("")).default(""),
  phone: z.string().optional().or(z.literal("")).default(""),
  location: z.string().optional().or(z.literal("")).default(""),
  linkedin: z.string().optional().or(z.literal("")).default(""),
  github: z.string().optional().or(z.literal("")).default(""),
  website: z.string().optional().or(z.literal("")).default(""),
});

export const ExperienceItemSchema = z.object({
  role: z.string().default(""),
  company: z.string().default(""),
  location: z.string().optional().default(""),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  description: z.string().optional().default(""),
  highlights: z.array(z.string()).default([]),
});

export const EducationItemSchema = z.object({
  degree: z.string().default(""),
  institution: z.string().default(""),
  graduationYear: z.string().optional().default(""),
  gpa: z.string().optional().default(""),
  fieldOfStudy: z.string().optional().default(""),
});

export const ProjectItemSchema = z.object({
  name: z.string().default(""),
  description: z.string().optional().default(""),
  technologies: z.array(z.string()).default([]),
  url: z.string().optional().default(""),
});

export const ParsedProfileSchema = z.object({
  name: z.string().min(1, "Name could not be parsed").default("Candidate"),
  contact: ContactDetailsSchema.default({
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
    website: "",
  }),
  designation: z.string().default("Software Engineer"),
  yearsOfExperience: z.number().default(0),
  skills: z.array(z.string()).default([]),
  experience: z.array(ExperienceItemSchema).default([]),
  education: z.array(EducationItemSchema).default([]),
  projects: z.array(ProjectItemSchema).default([]),
  summary: z.string().optional().default(""),
  rawTextLength: z.number().default(0),
});

export type ContactDetails = z.infer<typeof ContactDetailsSchema>;
export type ExperienceItem = z.infer<typeof ExperienceItemSchema>;
export type EducationItem = z.infer<typeof EducationItemSchema>;
export type ProjectItem = z.infer<typeof ProjectItemSchema>;
export type ParsedProfile = z.infer<typeof ParsedProfileSchema>;

export interface ResumeParseResult {
  success: boolean;
  profile?: ParsedProfile;
  error?: string;
  sourceFileName?: string;
  fileSizeBytes?: number;
}
