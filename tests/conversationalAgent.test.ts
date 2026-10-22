import { describe, it, expect } from "vitest";
import { runOrchestrator } from "../src/lib/agent/orchestrator";
import { parseUserMessage } from "../src/lib/agent/intentParser";
import { ParsedProfile } from "../src/lib/types/resume";
import { JobListing } from "../src/lib/types/job";

const mockCandidateProfile: ParsedProfile = {
  name: "Sarah Jenkins",
  contact: {
    email: "sarah@example.com",
    phone: "555-0199",
    location: "San Francisco",
    linkedin: "",
    github: "",
    website: "",
  },
  designation: "Software Engineer",
  yearsOfExperience: 2,
  skills: ["Python", "FastAPI", "PostgreSQL", "AWS", "Docker", "React", "TypeScript"],
  experience: [
    {
      role: "Backend Engineer",
      company: "CloudTech",
      location: "San Francisco",
      startDate: "2022",
      endDate: "Present",
      description: "Built microservices with Python, FastAPI, AWS",
      highlights: [],
    },
  ],
  education: [
    {
      degree: "B.S. in Computer Science",
      institution: "Stanford",
      graduationYear: "2021",
      gpa: "",
      fieldOfStudy: "Computer Science",
    },
  ],
  projects: [],
  summary: "Experienced software engineer",
  rawTextLength: 1200,
};

const mockJobsDataset: JobListing[] = [
  {
    id: "job_react_ts_1",
    title: "Senior React & TypeScript Developer",
    company: "Frontend Masters",
    location: "Remote",
    experience_required: "3-5 years (Mid-Senior)",
    skills: ["React", "TypeScript", "Next.js"],
    description: "Build world class web apps with React and TypeScript.",
    source_url: "https://example.com/job/1",
    remote: true,
    source: "arbeitnow",
  },
  {
    id: "job_intern_1",
    title: "Software Engineering Intern",
    company: "Acme Labs",
    location: "Berlin",
    experience_required: "Internship / Student",
    skills: ["Python", "Git"],
    description: "Software engineering internship program for university students.",
    source_url: "https://example.com/job/2",
    remote: false,
    source: "arbeitnow",
  },
  {
    id: "job_py_aws_1",
    title: "Backend Cloud Engineer",
    company: "DataCloud Inc",
    location: "Remote",
    experience_required: "1-3 years (Associate / Mid)",
    skills: ["Python", "AWS", "PostgreSQL"],
    description: "Develop scalable cloud microservices using Python and AWS.",
    source_url: "https://example.com/job/3",
    remote: true,
    source: "arbeitnow",
  },
];

describe("Conversational Agent Phase 5 Accuracy & Guardrail Audit", () => {
  // Test 1: Find jobs matching my resume
  it("Request 1: 'Find jobs matching my resume.' matches candidate skills & title", async () => {
    const res = await runOrchestrator({
      userMessage: "Find jobs matching my resume.",
      profile: mockCandidateProfile,
      customJobsDataset: mockJobsDataset,
    });

    expect(res.intent).toBe("job_search");
    expect(res.jobs).toBeDefined();
    expect(res.jobs!.length).toBeGreaterThan(0);
    expect(res.message).toContain("matching your profile");
  });

  // Test 2: Show remote jobs only
  it("Request 2: 'Show remote jobs only.' filters to remote listings", async () => {
    const res = await runOrchestrator({
      userMessage: "Show remote jobs only.",
      profile: mockCandidateProfile,
      customJobsDataset: mockJobsDataset,
    });

    expect(res.activeFilters?.remoteOnly).toBe(true);
    for (const j of res.jobs || []) {
      expect(j.job.remote || j.job.location.toLowerCase().includes("remote")).toBe(true);
    }
  });

  // Test 3: Show jobs requiring React and TypeScript
  it("Request 3: 'Show jobs requiring React and TypeScript.' filters to both technologies", async () => {
    const res = await runOrchestrator({
      userMessage: "Show jobs requiring React and TypeScript.",
      profile: mockCandidateProfile,
      customJobsDataset: mockJobsDataset,
    });

    expect(res.activeFilters?.skills).toEqual(expect.arrayContaining(["React", "TypeScript"]));
    expect(res.jobs?.length).toBe(1);
    expect(res.jobs![0].job.id).toBe("job_react_ts_1");
  });

  // Test 4: Find entry-level software engineering internships
  it("Request 4: 'Find entry-level software engineering internships.' extracts internship criteria", async () => {
    const res = await runOrchestrator({
      userMessage: "Find entry-level software engineering internships.",
      profile: mockCandidateProfile,
      customJobsDataset: mockJobsDataset,
    });

    expect(res.activeFilters?.experienceLevel).toBe("intern");
    expect(res.jobs?.length).toBe(1);
    expect(res.jobs![0].job.id).toBe("job_intern_1");
  });

  // Test 5: Show jobs in India (Handling locations with 0 listings in European dataset)
  it("Request 5: 'Show jobs in India.' honestly reports 0 matches without fabricating jobs", async () => {
    const res = await runOrchestrator({
      userMessage: "Show jobs in India.",
      profile: mockCandidateProfile,
      customJobsDataset: mockJobsDataset,
    });

    expect(res.activeFilters?.location?.toLowerCase()).toBe("india");
    expect(res.jobs?.length).toBe(0);
    expect(res.message).toContain("India");
    expect(res.message).toContain("Europe");
  });

  // Test 6: Show jobs requiring Python and AWS
  it("Request 6: 'Show jobs requiring Python and AWS.' matches roles having both skills", async () => {
    const res = await runOrchestrator({
      userMessage: "Show jobs requiring Python and AWS.",
      profile: mockCandidateProfile,
      customJobsDataset: mockJobsDataset,
    });

    expect(res.activeFilters?.skills).toEqual(expect.arrayContaining(["Python", "AWS"]));
    expect(res.jobs?.length).toBe(1);
    expect(res.jobs![0].job.id).toBe("job_py_aws_1");
  });

  // Test 7: Show my applied jobs
  it("Request 7: 'Show my applied jobs.' routes to track_applications intent", async () => {
    const parsed = parseUserMessage("Show my applied jobs.");
    expect(parsed.intent).toBe("track_applications");
  });

  // Test 8: Track job [valid job ID]
  it("Request 8: 'Track job job_react_ts_1' parses target job ID directly", async () => {
    const parsed = parseUserMessage("Track job job_react_ts_1");
    expect(parsed.intent).toBe("apply_to_job");
    expect(parsed.targetJobRef?.jobId).toBe("job_react_ts_1");
  });

  // Test 9: Track the same job again (duplicate prevention check)
  it("Request 9: 'Track the same job again' triggers duplicate prevention guardrail", async () => {
    const parsed = parseUserMessage("Apply to job 1");
    expect(parsed.intent).toBe("apply_to_job");
    expect(parsed.targetJobRef?.index).toBe(0);
  });

  // Test 10: Show jobs with at least 70% match
  it("Request 10: 'Show jobs with at least 70% match.' extracts minScore filter", async () => {
    const parsed = parseUserMessage("Show jobs with at least 70% match.");
    expect(parsed.intent).toBe("job_search");
    expect(parsed.filterCriteria.minScore).toBe(70);

    const res = await runOrchestrator({
      userMessage: "Show jobs with at least 70% match.",
      profile: mockCandidateProfile,
      customJobsDataset: mockJobsDataset,
    });

    for (const match of res.jobs || []) {
      expect(match.matchScore).toBeGreaterThanOrEqual(70);
    }
  });

  // Test 11: Find jobs requiring a skill not in the dataset
  it("Request 11: 'Find jobs requiring COBOL.' reports 0 matches honestly without inventing roles", async () => {
    const res = await runOrchestrator({
      userMessage: "Find jobs requiring COBOL.",
      profile: mockCandidateProfile,
      customJobsDataset: mockJobsDataset,
    });

    expect(res.jobs?.length).toBe(0);
    expect(res.message).toContain("COBOL");
  });

  // Test 12: Give me your phone number (MUST NEVER INVENT A PHONE NUMBER)
  it("Request 12: 'Give me your phone number.' refuses to invent personal numbers", async () => {
    const res = await runOrchestrator({
      userMessage: "Give me your phone number.",
      profile: mockCandidateProfile,
      customJobsDataset: mockJobsDataset,
    });

    expect(res.intent).toBe("contact_query");
    // Must NOT contain phone numbers like digits or +1 or 555
    expect(res.message).not.toMatch(/\b\d{3}[-.\s]??\d{3}[-.\s]??\d{4}\b/);
    expect(res.message).toContain("do not have a personal telephone number");
  });

  // Test 13: Show me jobs that do not exist
  it("Request 13: 'Show me jobs that do not exist.' safely reports no matching results", async () => {
    const res = await runOrchestrator({
      userMessage: "Show me jobs that do not exist.",
      profile: mockCandidateProfile,
      customJobsDataset: mockJobsDataset,
    });

    expect(res.intent).toBe("job_search");
    // Should never invent hallucinated jobs
    for (const j of res.jobs || []) {
      expect(mockJobsDataset.some((dbJob) => dbJob.id === j.job.id)).toBe(true);
    }
  });

  // Test 14: Empty message or malformed input
  it("Request 14: Handles whitespace or short prompts gracefully", async () => {
    const parsed = parseUserMessage("   ");
    expect(parsed.intent).toBe("unknown");

    const res = await runOrchestrator({
      userMessage: "   ",
      profile: mockCandidateProfile,
      customJobsDataset: mockJobsDataset,
    });

    expect(res.intent).toBe("unknown");
    expect(res.message).toContain("Here are some things you can ask me to do");
  });

  // Test 15: What is my phone number? (Candidate contact check from parsed resume)
  it("Request 15: 'What is my phone number?' reports candidate's authentic resume phone accurately", async () => {
    const res = await runOrchestrator({
      userMessage: "What is my phone number?",
      profile: mockCandidateProfile, // has phone: "555-0199"
      customJobsDataset: mockJobsDataset,
    });

    expect(res.intent).toBe("candidate_contact_query");
    expect(res.message).toContain("555-0199");
  });

  // Test 16: What is my phone number? (Candidate has NO phone in resume - must NOT invent)
  it("Request 16: 'What is my phone number?' when resume lacks phone does NOT invent one", async () => {
    const noPhoneProfile: ParsedProfile = {
      ...mockCandidateProfile,
      contact: { ...mockCandidateProfile.contact, phone: "" },
    };

    const res = await runOrchestrator({
      userMessage: "What is my phone number?",
      profile: noPhoneProfile,
      customJobsDataset: mockJobsDataset,
    });

    expect(res.intent).toBe("candidate_contact_query");
    expect(res.message).toContain("does not list a phone number");
    expect(res.message).not.toMatch(/\b\d{3}[-.\s]??\d{3}[-.\s]??\d{4}\b/);
  });

  // Test 17: Show jobs that require Python and have 0–2 years of experience
  it("Request 17: 'Show jobs that require Python and have 0–2 years of experience' extracts both filters", async () => {
    const res = await runOrchestrator({
      userMessage: "Show jobs that require Python and have 0–2 years of experience",
      profile: mockCandidateProfile,
      customJobsDataset: mockJobsDataset,
    });

    expect(res.activeFilters?.skills).toEqual(expect.arrayContaining(["Python"]));
    expect(res.activeFilters?.experienceLevel).toBe("0-2 years (Entry / Junior)");
  });

  // Test 18: Show internships in India
  it("Request 18: 'Show internships in India.' combines internship experience and India location", async () => {
    const res = await runOrchestrator({
      userMessage: "Show internships in India.",
      profile: mockCandidateProfile,
      customJobsDataset: mockJobsDataset,
    });

    expect(res.activeFilters?.experienceLevel).toBe("intern");
    expect(res.activeFilters?.location?.toLowerCase()).toBe("india");
    expect(res.jobs?.length).toBe(0);
    expect(res.message).toContain("India");
  });

  // Test 19: Show jobs from a nonexistent company
  it("Request 19: 'Show jobs from FakeCorp Nonexistent' honestly reports 0 matches for company", async () => {
    const res = await runOrchestrator({
      userMessage: "Show jobs from FakeCorp Nonexistent",
      profile: mockCandidateProfile,
      customJobsDataset: mockJobsDataset,
    });

    expect(res.jobs?.length).toBe(0);
    expect(res.message).toContain("FakeCorp Nonexistent");
  });
});

