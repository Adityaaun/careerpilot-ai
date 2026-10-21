import { describe, it, expect } from "vitest";
import { scoreJobMatch, matchJobs } from "../src/lib/tools/jobMatcher";
import { JobListing } from "../src/lib/types/job";
import { ParsedProfile } from "../src/lib/types/resume";

const mockJobs: JobListing[] = [
  {
    id: "job_react_sr",
    title: "Senior Full Stack Engineer (React/Node)",
    company: "Alpha Innovations",
    location: "Berlin, Germany",
    experience_required: "5+ years (Senior / Lead)",
    skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "AWS"],
    description: "Looking for a senior full stack engineer to build robust cloud architectures using React, TypeScript and Node.js.",
    source_url: "https://example.com/jobs/alpha-1",
    remote: true,
    source: "arbeitnow",
  },
  {
    id: "job_python_mid",
    title: "Backend Python Developer",
    company: "Beta Analytics",
    location: "Munich, Germany",
    experience_required: "3-5 years (Mid-Senior)",
    skills: ["Python", "Django", "PostgreSQL", "Docker"],
    description: "Build high-throughput data processing services using Python and PostgreSQL.",
    source_url: "https://example.com/jobs/beta-2",
    remote: false,
    source: "arbeitnow",
  },
  {
    id: "job_intern",
    title: "Frontend Engineering Intern",
    company: "Gamma Apps",
    location: "Remote",
    experience_required: "Internship / Student",
    skills: ["HTML", "CSS", "JavaScript", "React"],
    description: "Exciting internship opportunity for students passionate about frontend web technologies.",
    source_url: "https://example.com/jobs/gamma-3",
    remote: true,
    source: "arbeitnow",
  },
  {
    id: "job_tie_a",
    title: "Full Stack Developer",
    company: "Delta Tech A",
    location: "Remote",
    experience_required: "1-3 years (Associate / Mid)",
    skills: ["JavaScript", "React"],
    description: "General web developer role with React and JavaScript.",
    source_url: "https://example.com/jobs/delta-a",
    remote: true,
    source: "arbeitnow",
  },
  {
    id: "job_tie_b",
    title: "Full Stack Developer",
    company: "Delta Tech B",
    location: "Remote",
    experience_required: "1-3 years (Associate / Mid)",
    skills: ["JavaScript", "React"],
    description: "General web developer role with React and JavaScript.",
    source_url: "https://example.com/jobs/delta-b",
    remote: true,
    source: "arbeitnow",
  },
];

const mockSeniorProfile: ParsedProfile = {
  name: "Morgan Taylor",
  contact: { email: "morgan@example.com", phone: "", location: "", linkedin: "", github: "", website: "" },
  designation: "Senior Full Stack Engineer",
  yearsOfExperience: 6,
  skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "AWS", "Docker"],
  experience: [],
  education: [],
  projects: [],
  summary: "",
  rawTextLength: 100,
};

const mockJuniorPythonProfile: ParsedProfile = {
  name: "Riley Davis",
  contact: { email: "riley@example.com", phone: "", location: "", linkedin: "", github: "", website: "" },
  designation: "Backend Developer",
  yearsOfExperience: 1,
  skills: ["Python", "Flask", "SQL"],
  experience: [],
  education: [],
  projects: [],
  summary: "",
  rawTextLength: 100,
};

describe("Job Matcher Tool", () => {
  describe("scoreJobMatch", () => {
    it("gives a high score to a strong matching profile", () => {
      const match = scoreJobMatch(mockSeniorProfile, mockJobs[0]);
      expect(match.matchScore).toBeGreaterThanOrEqual(80);
      expect(match.matchedSkills).toContain("React");
      expect(match.matchedSkills).toContain("TypeScript");
      expect(match.matchedSkills).toContain("Node.js");
      expect(match.matchReason).toContain("Matches");
    });

    it("gives a moderate score on partial skill overlap with experience mismatch", () => {
      const match = scoreJobMatch(mockJuniorPythonProfile, mockJobs[1]);
      // Has Python and SQL/Postgres, but junior experience (1 yr) applying to 3-5 yrs role
      expect(match.matchScore).toBeGreaterThanOrEqual(40);
      expect(match.matchScore).toBeLessThan(80);
      expect(match.matchedSkills).toContain("Python");
    });

    it("handles candidates with missing skills without crashing or negative scores", () => {
      const emptyProfile: ParsedProfile = {
        name: "Anonymous",
        contact: { email: "", phone: "", location: "", linkedin: "", github: "", website: "" },
        designation: "Developer",
        yearsOfExperience: 2,
        skills: [],
        experience: [],
        education: [],
        projects: [],
        summary: "",
        rawTextLength: 50,
      };

      const match = scoreJobMatch(emptyProfile, mockJobs[0]);
      expect(match.matchScore).toBeGreaterThanOrEqual(0);
      expect(match.matchScore).toBeLessThanOrEqual(100);
      expect(match.matchedSkills).toEqual([]);
    });
  });

  describe("matchJobs Filtering & Ranking", () => {
    it("filters remote-only roles correctly", () => {
      const results = matchJobs(mockSeniorProfile, { remoteOnly: true }, mockJobs);
      expect(results.length).toBeGreaterThan(0);
      results.forEach((r) => {
        expect(r.job.remote || r.job.location.toLowerCase().includes("remote")).toBe(true);
      });
      // The non-remote job (Beta Analytics in Munich) must NOT be present
      expect(results.some((r) => r.job.id === "job_python_mid")).toBe(false);
    });

    it("filters by required skills", () => {
      const results = matchJobs(mockSeniorProfile, { skills: ["Python"] }, mockJobs);
      expect(results.length).toBe(1);
      expect(results[0].job.id).toBe("job_python_mid");
    });

    it("filters by free-text keyword query", () => {
      const results = matchJobs(mockSeniorProfile, { query: "intern" }, mockJobs);
      expect(results.length).toBe(1);
      expect(results[0].job.id).toBe("job_intern");
    });

    it("handles empty dataset gracefully without error", () => {
      const results = matchJobs(mockSeniorProfile, undefined, []);
      expect(results).toEqual([]);
    });

    it("handles zero matches gracefully when filters exclude all jobs", () => {
      const results = matchJobs(
        mockSeniorProfile,
        { query: "nonexistent-quantum-cryptography-role-12345" },
        mockJobs
      );
      expect(results).toEqual([]);
    });

    it("sorts deterministically when match scores are tied", () => {
      const tieProfile: ParsedProfile = {
        name: "Tie Tester",
        contact: { email: "", phone: "", location: "", linkedin: "", github: "", website: "" },
        designation: "Full Stack Developer",
        yearsOfExperience: 2,
        skills: ["React", "JavaScript"],
        experience: [],
        education: [],
        projects: [],
        summary: "",
        rawTextLength: 50,
      };

      const results = matchJobs(tieProfile, { query: "Delta" }, mockJobs);
      expect(results.length).toBe(2);
      expect(results[0].matchScore).toBe(results[1].matchScore);
      // Tie breaker should sort by job.id ascending
      expect(results[0].job.id).toBe("job_tie_a");
      expect(results[1].job.id).toBe("job_tie_b");
    });

    it("respects the requested result limit", () => {
      const results = matchJobs(mockSeniorProfile, { limit: 2 }, mockJobs);
      expect(results.length).toBe(2);
    });
  });
});
