import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { runOrchestrator } from "../src/lib/agent/orchestrator";
import { ParsedProfile } from "../src/lib/types/resume";
import { JobListing, JobMatchResult } from "../src/lib/types/job";

const testStorage = path.resolve("./data/test_orch_applications.json");

const mockJobs: JobListing[] = [
  {
    id: "job_react_1",
    title: "Senior React Engineer",
    company: "CloudFrontier",
    location: "Remote",
    experience_required: "5+ years (Senior / Lead)",
    skills: ["React", "TypeScript", "Node.js", "GraphQL"],
    description: "Build cutting-edge user interfaces using React and TypeScript in a remote team.",
    source_url: "https://example.com/jobs/react-1",
    remote: true,
    source: "arbeitnow",
  },
  {
    id: "job_python_2",
    title: "Python Backend Developer",
    company: "DataStream Labs",
    location: "Berlin, Germany",
    experience_required: "3-5 years (Mid-Senior)",
    skills: ["Python", "Django", "PostgreSQL", "Docker"],
    description: "Design distributed data processing systems using Python and Django.",
    source_url: "https://example.com/jobs/python-2",
    remote: false,
    source: "arbeitnow",
  },
  {
    id: "job_intern_3",
    title: "Frontend Developer Intern",
    company: "NextGen Software",
    location: "Munich, Germany",
    experience_required: "Internship / Student",
    skills: ["JavaScript", "HTML", "CSS", "React"],
    description: "Great summer internship opportunity for frontend development enthusiasts.",
    source_url: "https://example.com/jobs/intern-3",
    remote: false,
    source: "arbeitnow",
  },
];

const mockCandidateProfile: ParsedProfile = {
  name: "Taylor Reed",
  contact: {
    email: "taylor.reed@example.com",
    phone: "555-123-4567",
    location: "Berlin",
    linkedin: "linkedin.com/in/taylor-reed",
    github: "github.com/treed-dev",
    website: "https://treed.dev",
  },
  designation: "Senior React Engineer",
  yearsOfExperience: 6,
  skills: ["React", "TypeScript", "JavaScript", "Node.js", "Next.js", "Docker", "Git"],
  experience: [
    {
      role: "Senior React Engineer",
      company: "WebWorks Inc",
      location: "",
      startDate: "2021",
      endDate: "Present",
      description: "Leading frontend team developing SaaS dashboard in Next.js and TypeScript.",
      highlights: ["Improved render performance by 40%"],
    },
  ],
  education: [
    {
      degree: "B.S. Computer Science",
      institution: "Technical University",
      graduationYear: "2019",
      gpa: "",
      fieldOfStudy: "Computer Science",
    },
  ],
  projects: [],
  summary: "Experienced frontend engineer specialized in modern React ecosystems.",
  rawTextLength: 200,
};

describe("Agent Orchestrator Integration Tests", () => {
  beforeEach(() => {
    if (fs.existsSync(testStorage)) {
      fs.unlinkSync(testStorage);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testStorage)) {
      fs.unlinkSync(testStorage);
    }
    const dir = path.dirname(testStorage);
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f.startsWith("test_orch_applications.json.")) {
        fs.unlinkSync(path.join(dir, f));
      }
    }
  });

  // 1. Greeting without LLM key
  it("handles greeting naturally using deterministic fallback", async () => {
    const output = await runOrchestrator({
      userMessage: "Hello!",
      customJobsDataset: mockJobs,
      customStoragePath: testStorage,
    });

    expect(output.intent).toBe("greeting");
    expect(output.message).toContain("CareerPilot AI");
    expect(output.provider).toBe("deterministic-fallback");
    expect(output.suggestedFollowUps?.length).toBeGreaterThan(0);
  });

  // 2. Job search after resume is parsed
  it("performs job search matching the parsed profile", async () => {
    const output = await runOrchestrator({
      userMessage: "Find jobs matching my resume.",
      profile: mockCandidateProfile,
      customJobsDataset: mockJobs,
      customStoragePath: testStorage,
    });

    expect(output.intent).toBe("job_search");
    expect(output.jobs).toBeDefined();
    expect(output.jobs!.length).toBeGreaterThan(0);
    // CloudFrontier (React) must be the top ranked match
    expect(output.jobs![0].job.id).toBe("job_react_1");
    expect(output.jobs![0].matchScore).toBeGreaterThanOrEqual(80);
    expect(output.message).toContain("matching your profile");
  });

  // 3. Remote-only filtering
  it("applies remote-only filter when requested", async () => {
    const output = await runOrchestrator({
      userMessage: "Show only remote jobs.",
      profile: mockCandidateProfile,
      customJobsDataset: mockJobs,
      customStoragePath: testStorage,
    });

    expect(output.jobs).toBeDefined();
    expect(output.jobs!.length).toBe(1);
    expect(output.jobs![0].job.remote).toBe(true);
    expect(output.jobs![0].job.id).toBe("job_react_1");
  });

  // 4. Required-skill filtering
  it("applies required-skill filtering (e.g. Python)", async () => {
    const output = await runOrchestrator({
      userMessage: "Find jobs requiring Python.",
      profile: mockCandidateProfile,
      customJobsDataset: mockJobs,
      customStoragePath: testStorage,
    });

    expect(output.jobs).toBeDefined();
    expect(output.jobs!.length).toBe(1);
    expect(output.jobs![0].job.id).toBe("job_python_2");
    expect(output.jobs![0].job.skills).toContain("Python");
  });

  // 5. Follow-up refinement preserving context
  it("preserves active filters across follow-up queries", async () => {
    // Current state has remoteOnly: true
    const currentJobsMock: JobMatchResult[] = [
      {
        job: mockJobs[0],
        matchScore: 90,
        matchedSkills: ["React", "TypeScript"],
        missingSkills: [],
        matchReason: "Direct match",
      },
    ];

    const output = await runOrchestrator({
      userMessage: "Also require TypeScript and Node",
      profile: mockCandidateProfile,
      currentJobs: currentJobsMock,
      activeFilters: { remoteOnly: true },
      customJobsDataset: mockJobs,
      customStoragePath: testStorage,
    });

    expect(output.intent).toBe("refine_search");
    expect(output.activeFilters?.remoteOnly).toBe(true);
    expect(output.activeFilters?.skills).toContain("TypeScript");
    expect(output.activeFilters?.skills).toContain("Node");
  });

  // 6. Applying to a valid displayed job by index (e.g. "apply to job 1")
  it("applies to a valid displayed job using ordinal/index reference", async () => {
    const displayedJobs: JobMatchResult[] = [
      {
        job: mockJobs[0],
        matchScore: 92,
        matchedSkills: ["React"],
        missingSkills: [],
        matchReason: "Strong fit",
      },
      {
        job: mockJobs[1],
        matchScore: 60,
        matchedSkills: ["PostgreSQL"],
        missingSkills: [],
        matchReason: "Partial fit",
      },
    ];

    const output = await runOrchestrator({
      userMessage: "Apply to job 1",
      profile: mockCandidateProfile,
      currentJobs: displayedJobs,
      customJobsDataset: mockJobs,
      customStoragePath: testStorage,
    });

    expect(output.intent).toBe("apply_to_job");
    expect(output.application).toBeDefined();
    expect(output.application?.jobId).toBe("job_react_1");
    expect(output.application?.status).toBe("tracked");
    expect(output.message).toContain("Application Tracked Successfully");
    expect(output.message).toContain("CloudFrontier");
  });

  // 7. Invalid or ambiguous job reference
  it("handles out-of-range job index gracefully with informative message", async () => {
    const displayedJobs: JobMatchResult[] = [
      {
        job: mockJobs[0],
        matchScore: 90,
        matchedSkills: ["React"],
        missingSkills: [],
        matchReason: "Fit",
      },
    ];

    const output = await runOrchestrator({
      userMessage: "Apply to job 9",
      currentJobs: displayedJobs,
      customJobsDataset: mockJobs,
      customStoragePath: testStorage,
    });

    expect(output.intent).toBe("apply_to_job");
    expect(output.application).toBeUndefined();
    expect(output.message).toContain("Job number 9 is out of range");
  });

  it("clarifies when user says 'apply' with multiple jobs displayed and no index", async () => {
    const displayedJobs: JobMatchResult[] = [
      { job: mockJobs[0], matchScore: 90, matchedSkills: [], missingSkills: [], matchReason: "" },
      { job: mockJobs[1], matchScore: 70, matchedSkills: [], missingSkills: [], matchReason: "" },
    ];

    const output = await runOrchestrator({
      userMessage: "I want to apply",
      currentJobs: displayedJobs,
      customJobsDataset: mockJobs,
      customStoragePath: testStorage,
    });

    expect(output.intent).toBe("apply_to_job");
    expect(output.application).toBeUndefined();
    expect(output.message).toContain("Which job would you like to apply to?");
  });

  // 8. Duplicate application handling
  it("prevents duplicate applications for the same job and provides duplicate notice", async () => {
    const displayedJobs: JobMatchResult[] = [
      { job: mockJobs[0], matchScore: 90, matchedSkills: [], missingSkills: [], matchReason: "" },
    ];

    // First application
    const firstOutput = await runOrchestrator({
      userMessage: "Apply to job 1",
      currentJobs: displayedJobs,
      customJobsDataset: mockJobs,
      customStoragePath: testStorage,
    });
    expect(firstOutput.application?.status).toBe("tracked");

    // Second application to the same job
    const secondOutput = await runOrchestrator({
      userMessage: "Apply to job 1",
      currentJobs: displayedJobs,
      customJobsDataset: mockJobs,
      customStoragePath: testStorage,
    });

    expect(secondOutput.message).toContain("Duplicate Notice");
    expect(secondOutput.message).toContain("already recorded an application");
  });

  // 9. Application tracking
  it("retrieves and lists tracked applications", async () => {
    const displayedJobs: JobMatchResult[] = [
      { job: mockJobs[0], matchScore: 90, matchedSkills: [], missingSkills: [], matchReason: "" },
    ];

    // Apply first
    await runOrchestrator({
      userMessage: "Apply to job 1",
      currentJobs: displayedJobs,
      customJobsDataset: mockJobs,
      customStoragePath: testStorage,
    });

    // Ask to view applications
    const trackOutput = await runOrchestrator({
      userMessage: "Show my applied jobs",
      customJobsDataset: mockJobs,
      customStoragePath: testStorage,
    });

    expect(trackOutput.intent).toBe("track_applications");
    expect(trackOutput.applications?.length).toBe(1);
    expect(trackOutput.applications![0].jobId).toBe("job_react_1");
    expect(trackOutput.message).toContain("Senior React Engineer");
  });

  // 10. No matching jobs handling
  it("returns helpful message when filters produce 0 matches", async () => {
    const output = await runOrchestrator({
      userMessage: "Show jobs requiring Rust in Bangalore",
      profile: mockCandidateProfile,
      customJobsDataset: mockJobs,
      customStoragePath: testStorage,
    });

    expect(output.jobs?.length).toBe(0);
    expect(output.message).toContain("No jobs were found matching your current filter criteria");
  });

  // 11. Missing resume profile guidance
  it("allows searching without a resume but encourages uploading one for personalized scoring", async () => {
    const output = await runOrchestrator({
      userMessage: "Show developer jobs",
      profile: undefined, // no profile uploaded yet
      customJobsDataset: mockJobs,
      customStoragePath: testStorage,
    });

    expect(output.jobs?.length).toBeGreaterThan(0);
    expect(output.message).toContain("upload your resume for personalized match scores");
  });
});
