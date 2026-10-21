import { JobFilterCriteria } from "../types/job";

export type UserIntent =
  | "greeting"
  | "resume_upload"
  | "resume_status"
  | "job_search"
  | "refine_search"
  | "apply_to_job"
  | "track_applications"
  | "help"
  | "unknown";

export interface ParsedUserInput {
  intent: UserIntent;
  targetJobRef?: {
    index?: number; // 0-based index from current search results
    jobId?: string; // direct job ID string
    rawRef?: string;
    isAmbiguous?: boolean;
  };
  filterCriteria: JobFilterCriteria;
  confidence: number;
}

const COMMON_SKILLS = [
  "React", "Next.js", "TypeScript", "JavaScript", "Python", "Node.js", "Node", "Express",
  "Django", "FastAPI", "Flask", "Java", "Spring Boot", "C++", "C#", ".NET", "Go", "Golang",
  "Rust", "Ruby", "Rails", "PHP", "Laravel", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis",
  "AWS", "Azure", "GCP", "Docker", "Kubernetes", "GraphQL", "Tailwind", "Tailwind CSS",
  "Vue", "Angular", "DevOps", "CI/CD", "Git"
];

const ORDINAL_MAP: Record<string, number> = {
  first: 0,
  "1st": 0,
  one: 0,
  "1": 0,
  second: 1,
  "2nd": 1,
  two: 1,
  "2": 1,
  third: 2,
  "3rd": 2,
  three: 2,
  "3": 2,
  fourth: 3,
  "4th": 3,
  four: 3,
  "4": 3,
  fifth: 4,
  "5th": 4,
  five: 4,
  "5": 4,
  sixth: 5,
  "6th": 5,
  six: 5,
  "6": 5,
  seventh: 6,
  "7th": 6,
  seven: 6,
  "7": 6,
  eighth: 7,
  "8th": 7,
  eight: 7,
  "8": 7,
  ninth: 8,
  "9th": 8,
  nine: 8,
  "9": 8,
  tenth: 9,
  "10th": 9,
  ten: 9,
  "10": 9,
};

/**
 * Deterministic Natural Language Intent Parser and Entity Extractor
 */
export function parseUserMessage(
  message: string,
  hasActiveProfile = false,
  hasCurrentJobs = false
): ParsedUserInput {
  const text = message.trim();
  const lower = text.toLowerCase();

  const filterCriteria: JobFilterCriteria = {};

  // 1. Check Apply to Job intent
  const applyMatch = lower.match(/\b(apply|apply to|track|submit application for)\b/i);
  if (applyMatch) {
    // Look for direct job ID (e.g. arb_xxx or job_xxx)
    const directIdMatch = text.match(/\b(arb_[a-zA-Z0-9_-]+|job_[a-zA-Z0-9_-]+)\b/);
    if (directIdMatch) {
      return {
        intent: "apply_to_job",
        targetJobRef: { jobId: directIdMatch[1], rawRef: directIdMatch[1] },
        filterCriteria,
        confidence: 0.95,
      };
    }

    // Look for index or ordinal reference (e.g. "job 2", "second job", "job #3", "number 1")
    const indexMatch = lower.match(/(?:job|role|position|number|#)?\s*(?:#|\b)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+)(?:st|nd|rd|th)?\b/);
    if (indexMatch) {
      const token = indexMatch[1];
      let resolvedIndex = ORDINAL_MAP[token];
      if (resolvedIndex === undefined && /^\d+$/.test(token)) {
        resolvedIndex = parseInt(token, 10) - 1; // Convert 1-based human input to 0-based array index
      }

      if (resolvedIndex !== undefined && resolvedIndex >= 0) {
        return {
          intent: "apply_to_job",
          targetJobRef: { index: resolvedIndex, rawRef: token },
          filterCriteria,
          confidence: 0.9,
        };
      }
    }

    // Bare "apply" without identifiable reference
    return {
      intent: "apply_to_job",
      targetJobRef: { isAmbiguous: true, rawRef: text },
      filterCriteria,
      confidence: 0.7,
    };
  }

  // 2. Check Track Applications intent
  if (
    lower.includes("applied") ||
    lower.includes("my applications") ||
    lower.includes("view applied") ||
    lower.includes("track application") ||
    lower.includes("application status") ||
    lower.includes("previously applied")
  ) {
    return {
      intent: "track_applications",
      filterCriteria,
      confidence: 0.95,
    };
  }

  // 3. Check Resume Upload / Status intent (when not asking for job searches or matching)
  if (
    !lower.includes("job") &&
    !lower.includes("match") &&
    (
      lower.includes("upload resume") ||
      lower.includes("upload my resume") ||
      lower.includes("attach resume") ||
      lower.includes("how to upload") ||
      lower.includes("my resume") ||
      lower.includes("my profile") ||
      lower.includes("show my profile") ||
      lower.includes("parsed resume")
    )
  ) {
    return {
      intent: hasActiveProfile ? "resume_status" : "resume_upload",
      filterCriteria,
      confidence: 0.9,
    };
  }

  // 4. Check Greetings
  if (
    /^(hi|hello|hey|good morning|good afternoon|good evening|greetings)\b/i.test(lower) &&
    !lower.includes("job") &&
    !lower.includes("remote")
  ) {
    return {
      intent: "greeting",
      filterCriteria,
      confidence: 0.95,
    };
  }

  // 5. Check Help
  if (
    lower === "help" ||
    lower === "?" ||
    lower.includes("how does this work") ||
    lower.includes("what can you do")
  ) {
    return {
      intent: "help",
      filterCriteria,
      confidence: 0.9,
    };
  }

  // 6. Entity Extraction for Job Searches and Refinements
  // Remote filter
  if (
    lower.includes("remote") ||
    lower.includes("wfh") ||
    lower.includes("work from home") ||
    lower.includes("telecommute")
  ) {
    filterCriteria.remoteOnly = true;
  }

  // Skills filter
  const extractedSkills: string[] = [];
  for (const skill of COMMON_SKILLS) {
    const reg = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (reg.test(text)) {
      extractedSkills.push(skill);
    }
  }
  if (extractedSkills.length > 0) {
    filterCriteria.skills = extractedSkills;
  }

  // Limit filter (e.g. "top 5", "show 3")
  const limitMatch = lower.match(/\b(?:top|show|first)\s*(\d+)\b/);
  if (limitMatch) {
    filterCriteria.limit = Math.min(Math.max(parseInt(limitMatch[1], 10), 1), 30);
  }

  // Location filter (e.g. "in Berlin", "in Bangalore", "in Munich", "in Germany")
  const locMatch = text.match(/\bin\s+([A-Z][a-zA-Z\s]+?)(?:$|[.,;])/);
  if (locMatch && !locMatch[1].toLowerCase().includes("remote")) {
    filterCriteria.location = locMatch[1].trim();
  }

  // 7. Check if Refine Search vs New Search
  const isRefineKeyword =
    lower.includes("only") ||
    lower.includes("also") ||
    lower.includes("filter") ||
    lower.includes("refine") ||
    lower.includes("requiring") ||
    lower.includes("with");

  if (hasCurrentJobs && isRefineKeyword) {
    return {
      intent: "refine_search",
      filterCriteria,
      confidence: 0.85,
    };
  }

  // 8. General Job Search check
  if (
    lower.includes("job") ||
    lower.includes("match") ||
    lower.includes("role") ||
    lower.includes("developer") ||
    lower.includes("engineer") ||
    lower.includes("position") ||
    filterCriteria.remoteOnly ||
    (filterCriteria.skills && filterCriteria.skills.length > 0)
  ) {
    return {
      intent: "job_search",
      filterCriteria,
      confidence: 0.85,
    };
  }

  return {
    intent: "unknown",
    filterCriteria,
    confidence: 0.3,
  };
}
