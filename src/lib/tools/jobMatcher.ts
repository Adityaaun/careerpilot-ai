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
 * Normalizes a skill string to its canonical identifier to prevent accidental substring collisions
 * (e.g., ensuring "Go" does not match "Django", "Java" does not match "JavaScript", "C" does not match "React").
 */
export function normalizeSkill(skill: string): string {
  const s = skill.trim().replace(/[.,;!?]+$/, "").toLowerCase();

  const aliasMap: Record<string, string> = {
    js: "javascript",
    javascript: "javascript",
    ts: "typescript",
    typescript: "typescript",
    react: "react",
    reactjs: "react",
    "react.js": "react",
    "react native": "react native",
    "react-native": "react native",
    next: "next.js",
    nextjs: "next.js",
    "next.js": "next.js",
    node: "node.js",
    nodejs: "node.js",
    "node.js": "node.js",
    express: "express",
    "express.js": "express",
    py: "python",
    python: "python",
    golang: "go",
    go: "go",
    postgres: "postgresql",
    postgresql: "postgresql",
    k8s: "kubernetes",
    kubernetes: "kubernetes",
    aws: "aws",
    "amazon web services": "aws",
    gcp: "gcp",
    "google cloud": "gcp",
    "google cloud platform": "gcp",
    azure: "azure",
    "c++": "c++",
    cpp: "c++",
    "c#": "c#",
    csharp: "c#",
    dotnet: ".net",
    ".net": ".net",
    java: "java",
    sql: "sql",
    mysql: "mysql",
    mongodb: "mongodb",
    redis: "redis",
    docker: "docker",
    graphql: "graphql",
    fastapi: "fastapi",
    django: "django",
    flask: "flask",
    vue: "vue",
    vuejs: "vue",
    angular: "angular",
  };

  return aliasMap[s] || s;
}

/**
 * Checks whether a job contains a given skill safely without accidental substring collisions.
 */
export function jobContainsSkill(job: JobListing, skillName: string): boolean {
  const targetNorm = normalizeSkill(skillName);

  // 1. Check normalized tags in job.skills
  const hasTag = job.skills.some((js) => normalizeSkill(js) === targetNorm);
  if (hasTag) return true;

  // 2. Boundary-safe search in title and description
  const text = `${job.title} ${job.description}`.toLowerCase();

  if (targetNorm === "c++") {
    return /(?:^|[^a-zA-Z0-9])c\+\+(?:$|[^a-zA-Z0-9])/i.test(text);
  }
  if (targetNorm === "c#") {
    return /(?:^|[^a-zA-Z0-9])c#(?:$|[^a-zA-Z0-9])/i.test(text);
  }
  if (targetNorm === ".net") {
    return /(?:^|[^a-zA-Z0-9])\.net(?:$|[^a-zA-Z0-9])/i.test(text);
  }
  if (targetNorm === "go") {
    // Matches standalone 'go' or 'golang', but NOT inside 'django', 'algorithm', 'cargo', etc.
    return /\b(go|golang)\b/i.test(text) && !/django/i.test(text);
  }
  if (targetNorm === "java") {
    // Matches standalone 'java', but NOT 'javascript'
    return /\bjava\b/i.test(text) && !/\bjavascript\b/i.test(text.replace(/\bjava\b/i, ""));
  }
  if (targetNorm === "c") {
    return /(?:^|[^a-zA-Z0-9])c(?:$|[^a-zA-Z0-9])/i.test(text);
  }

  const escaped = targetNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\b`, "i");
  return regex.test(text);
}

/**
 * Evaluates candidate profile against a single job listing using transparent, explainable heuristic scoring.
 * Formula: Skills (50%) + Role Alignment (30%) + Experience Compatibility (20%) = 100% Max Score.
 */
export function scoreJobMatch(profile: ParsedProfile, job: JobListing): JobMatchResult {
  const candidateSkills = (profile.skills || []).map(normalizeSkill);
  const jobTagsNorm = (job.skills || []).map(normalizeSkill);
  const jobTitleLower = job.title.toLowerCase();

  // 1. Skill Matching (0 - 50 points)
  const matchedSkillsSet = new Set<string>();
  const missingSkillsSet = new Set<string>();

  // Check overlap with explicit job tags using exact normalized comparison
  for (const js of job.skills) {
    const jsNorm = normalizeSkill(js);
    const candidateHasIt = candidateSkills.some((cs) => cs === jsNorm);
    if (candidateHasIt) {
      matchedSkillsSet.add(js);
    } else {
      missingSkillsSet.add(js);
    }
  }

  // Also check if candidate's explicit skills appear in job description safely
  for (const cs of profile.skills) {
    if (jobContainsSkill(job, cs)) {
      matchedSkillsSet.add(cs);
    }
  }

  let skillScore = 0;
  if (candidateSkills.length === 0) {
    skillScore = 20; // neutral baseline when resume lacks explicit skills section
  } else if (jobTagsNorm.length > 0) {
    const ratio = matchedSkillsSet.size / Math.max(jobTagsNorm.length, 1);
    skillScore = Math.min(50, Math.round(ratio * 40 + (matchedSkillsSet.size > 0 ? 10 : 0)));
  } else {
    skillScore = Math.min(50, matchedSkillsSet.size * 12);
  }

  // 2. Role / Title Alignment (0 - 30 points)
  let roleScore = 10;
  const candidateDesig = (profile.designation || "").toLowerCase().trim();
  const titleTokens = jobTitleLower.split(/[\s/,-]+/).filter((t) => t.length > 2);
  const desigTokens = candidateDesig.split(/[\s/,-]+/).filter((t) => t.length > 2);

  const tokenOverlap = desigTokens.filter((dt) =>
    titleTokens.some((tt) => tt === dt || (tt.length > 3 && dt.length > 3 && (tt.includes(dt) || dt.includes(tt))))
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
  const missingSkills = Array.from(missingSkillsSet).filter(
    (s) => !matchedSkills.some((ms) => normalizeSkill(ms) === normalizeSkill(s))
  );

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
 * Searches and ranks jobs based on candidate profile and optional filter criteria.
 * Filters strictly check remote status, location, required skills, and experience tiers.
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

    // Required skills filter (strict inclusion: job must contain ALL requested skills)
    if (filter?.skills && filter.skills.length > 0) {
      const hasAllSkills = filter.skills.every((reqSkill) => jobContainsSkill(job, reqSkill));
      if (!hasAllSkills) return false;
    }

    // Experience level filter (e.g. "intern", "junior", "0-2", "senior", "5+")
    if (filter?.experienceLevel && filter.experienceLevel.trim().length > 0) {
      const expQuery = filter.experienceLevel.toLowerCase().trim();
      const jobExp = job.experience_required.toLowerCase();
      const jobTitle = job.title.toLowerCase();

      let expMatch = false;
      if (expQuery.includes("intern") || expQuery.includes("student")) {
        expMatch = jobExp.includes("intern") || jobExp.includes("student") || jobTitle.includes("intern") || jobTitle.includes("working student");
      } else if (expQuery.includes("0-2") || expQuery.includes("entry") || expQuery.includes("junior")) {
        expMatch = jobExp.includes("0-2") || jobExp.includes("entry") || jobExp.includes("junior") || jobTitle.includes("junior");
      } else if (expQuery.includes("1-3") || expQuery.includes("associate")) {
        expMatch = jobExp.includes("1-3") || jobExp.includes("associate");
      } else if (expQuery.includes("3-5") || expQuery.includes("mid")) {
        expMatch = jobExp.includes("3-5") || jobExp.includes("mid");
      } else if (expQuery.includes("5+") || expQuery.includes("senior") || expQuery.includes("lead")) {
        expMatch = jobExp.includes("5+") || jobExp.includes("senior") || jobExp.includes("lead") || jobTitle.includes("senior") || jobTitle.includes("lead");
      } else {
        expMatch = jobExp.includes(expQuery) || jobTitle.includes(expQuery);
      }

      if (!expMatch) return false;
    }

    // Free text query filter (search across title, company, skills, description)
    if (filter?.query && filter.query.trim().length > 0) {
      const qTokens = filter.query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
      const jobFullText = `${job.title} ${job.company} ${job.location} ${job.skills.join(" ")} ${job.description}`.toLowerCase();
      const matchesQuery = qTokens.every((tok) => jobFullText.includes(tok));
      if (!matchesQuery) return false;
    }

    return true;
  });

  // 2. Score and Rank
  let scored = filtered.map((job) => scoreJobMatch(profile, job));

  // 3. Min matchScore threshold filter (e.g. "at least 70% match")
  if (filter?.minScore !== undefined && filter.minScore > 0) {
    scored = scored.filter((item) => item.matchScore >= filter.minScore!);
  }

  // 4. Deterministic Sorting: matchScore DESC -> matchedSkills.length DESC -> job.id ASC
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
