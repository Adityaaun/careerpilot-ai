import fs from "fs";
import path from "path";
import { JobListing, JobMatchResult, JobFilterCriteria } from "../types/job";
import { ParsedProfile } from "../types/resume";

let cachedJobs: JobListing[] | null = null;

/**
 * Loads and caches the job dataset from disk
 */
export function getJobDataset(customPath?: string): JobListing[] {
  if (cachedJobs && !customPath) {
    return cachedJobs;
  }

  const filePath = customPath
    ? path.resolve(customPath)
    : path.join(process.cwd(), "data", "jobs.json");

  if (!fs.existsSync(filePath)) {
    // Fallback to sample dataset if full dataset is not present
    const samplePath = path.join(process.cwd(), "data", "jobs.sample.json");
    if (fs.existsSync(samplePath)) {
      const data = JSON.parse(fs.readFileSync(samplePath, "utf-8"));
      if (!customPath) cachedJobs = data;
      return data;
    }
    return [];
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  if (!customPath) cachedJobs = parsed;
  return parsed;
}

/**
 * Normalizes text token for comparison
 */
function normalize(term: string): string {
  return term.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Evaluates candidate profile against a single job listing
 */
export function scoreJobMatch(profile: ParsedProfile, job: JobListing): JobMatchResult {
  const candidateSkills = (profile.skills || []).map((s) => s.trim().toLowerCase());
  const jobSkills = (job.skills || []).map((s) => s.trim().toLowerCase());
  const jobDescLower = job.description.toLowerCase();
  const jobTitleLower = job.title.toLowerCase();

  // 1. Skill Matching (0 - 50 points)
  const matchedSkillsSet = new Set<string>();
  const missingSkillsSet = new Set<string>();

  // Check overlap with explicit job tags
  for (const js of job.skills) {
    const jsNorm = js.toLowerCase();
    const candidateHasIt = candidateSkills.some(
      (cs) => cs === jsNorm || jsNorm.includes(cs) || cs.includes(jsNorm)
    );
    if (candidateHasIt) {
      matchedSkillsSet.add(js);
    } else {
      missingSkillsSet.add(js);
    }
  }

  // Also check if candidate skills appear in job description
  for (const cs of profile.skills) {
    const regex = new RegExp(`\\b${cs.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (regex.test(jobDescLower) || regex.test(jobTitleLower)) {
      matchedSkillsSet.add(cs);
    }
  }

  let skillScore = 0;
  if (candidateSkills.length === 0) {
    skillScore = 20; // neutral baseline when resume lacks explicit skills section
  } else if (jobSkills.length > 0) {
    const ratio = matchedSkillsSet.size / Math.max(jobSkills.length, 1);
    skillScore = Math.min(50, Math.round(ratio * 40 + (matchedSkillsSet.size > 0 ? 10 : 0)));
  } else {
    skillScore = Math.min(50, matchedSkillsSet.size * 12);
  }

  // 2. Role / Title Alignment (0 - 30 points)
  let roleScore = 10;
  const candidateDesig = (profile.designation || "").toLowerCase();
  const titleTokens = jobTitleLower.split(/[\s/,-]+/).filter((t) => t.length > 2);
  const desigTokens = candidateDesig.split(/[\s/,-]+/).filter((t) => t.length > 2);

  const tokenOverlap = desigTokens.filter((dt) =>
    titleTokens.some((tt) => tt.includes(dt) || dt.includes(tt))
  );

  if (candidateDesig.length === 0) {
    roleScore = 15; // neutral baseline
  } else if (tokenOverlap.length >= 2 || jobTitleLower.includes(candidateDesig)) {
    roleScore = 30; // strong direct title alignment
  } else if (tokenOverlap.length === 1) {
    roleScore = 22; // partial title alignment
  } else if (
    (candidateDesig.includes("engineer") || candidateDesig.includes("developer")) &&
    (jobTitleLower.includes("engineer") || jobTitleLower.includes("developer"))
  ) {
    roleScore = 18; // general engineering overlap
  }

  // 3. Experience Alignment (0 - 20 points)
  let expScore = 12;
  const candYears = profile.yearsOfExperience || 0;
  const jobExpStr = job.experience_required.toLowerCase();

  if (jobExpStr.includes("intern") || jobExpStr.includes("student")) {
    expScore = candYears <= 2 ? 20 : 12;
  } else if (jobExpStr.includes("0-2") || jobExpStr.includes("entry") || jobExpStr.includes("junior")) {
    expScore = candYears <= 3 ? 20 : 14;
  } else if (jobExpStr.includes("1-3") || jobExpStr.includes("associate")) {
    expScore = candYears >= 1 && candYears <= 4 ? 20 : 15;
  } else if (jobExpStr.includes("3-5") || jobExpStr.includes("mid")) {
    expScore = candYears >= 3 && candYears <= 6 ? 20 : candYears < 3 ? 12 : 16;
  } else if (jobExpStr.includes("5+") || jobExpStr.includes("senior") || jobExpStr.includes("lead")) {
    expScore = candYears >= 5 ? 20 : candYears >= 3 ? 14 : 8;
  }

  const matchScore = Math.min(100, Math.max(0, skillScore + roleScore + expScore));
  const matchedSkills = Array.from(matchedSkillsSet);
  const missingSkills = Array.from(missingSkillsSet).filter((s) => !matchedSkillsSet.has(s));

  // 4. Transparent Match Reason
  const reasons: string[] = [];
  if (matchedSkills.length > 0) {
    reasons.push(
      `Matches ${matchedSkills.length} key skill${matchedSkills.length > 1 ? "s" : ""} (${matchedSkills.slice(0, 4).join(", ")})`
    );
  }
  if (roleScore >= 20) {
    reasons.push(`Strong title alignment with your ${profile.designation || "technical"} background`);
  }
  if (expScore >= 16) {
    reasons.push(`Experience level matches the required ${job.experience_required}`);
  } else if (expScore <= 10) {
    reasons.push(`Note: Requires ${job.experience_required}`);
  }

  const matchReason =
    reasons.length > 0
      ? reasons.join(". ") + "."
      : "Relevant general software engineering listing.";

  return {
    job,
    matchScore,
    matchedSkills,
    missingSkills,
    matchReason,
  };
}

/**
 * Searches and ranks jobs based on candidate profile and optional filter criteria
 */
export function matchJobs(
  profile: ParsedProfile,
  filter?: JobFilterCriteria,
  dataset?: JobListing[]
): JobMatchResult[] {
  const jobs = dataset || getJobDataset();
  const limit = Math.min(Math.max(filter?.limit || 10, 1), 50);

  // 1. Apply Filtering Criteria
  const filtered = jobs.filter((job) => {
    // Remote filter
    if (filter?.remoteOnly) {
      const isRemote = job.remote || job.location.toLowerCase().includes("remote");
      if (!isRemote) return false;
    }

    // Location filter
    if (filter?.location && filter.location.trim().length > 0) {
      const locQuery = filter.location.toLowerCase().trim();
      const jobLoc = job.location.toLowerCase();
      if (!jobLoc.includes(locQuery) && !(job.remote && locQuery === "remote")) {
        return false;
      }
    }

    // Required skills filter
    if (filter?.skills && filter.skills.length > 0) {
      const filterSkills = filter.skills.map(normalize);
      const jobAllText = `${job.title} ${job.skills.join(" ")} ${job.description}`.toLowerCase();
      const hasSkill = filterSkills.some((fs) => jobAllText.includes(fs));
      if (!hasSkill) return false;
    }

    // Free text query filter
    if (filter?.query && filter.query.trim().length > 0) {
      const qTokens = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
      const jobFullText = `${job.title} ${job.company} ${job.location} ${job.skills.join(" ")} ${job.description}`.toLowerCase();
      const matchesQuery = qTokens.some((tok) => jobFullText.includes(tok));
      if (!matchesQuery) return false;
    }

    return true;
  });

  // 2. Score and Rank
  const scored = filtered.map((job) => scoreJobMatch(profile, job));

  // 3. Deterministic Sorting: matchScore DESC -> matchedSkills.length DESC -> job.id ASC
  scored.sort((a, b) => {
    if (b.matchScore !== a.matchScore) {
      return b.matchScore - a.matchScore;
    }
    if (b.matchedSkills.length !== a.matchedSkills.length) {
      return b.matchedSkills.length - a.matchedSkills.length;
    }
    return a.job.id.localeCompare(b.job.id);
  });

  return scored.slice(0, limit);
}
