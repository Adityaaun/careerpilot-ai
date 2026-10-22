import { JobFilterCriteria } from "../types/job";

export type UserIntent =
  | "greeting"
  | "resume_upload"
  | "resume_status"
  | "job_search"
  | "refine_search"
  | "apply_to_job"
  | "track_applications"
  | "contact_query"
  | "candidate_contact_query"
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
  "Vue", "Angular", "DevOps", "CI/CD", "Git", "Haskell", "Scala", "Elixir", "COBOL"
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

  // Whitespace or empty message fallback to unknown
  if (!text || text.length === 0) {
    return {
      intent: "unknown",
      filterCriteria,
      confidence: 0.1,
    };
  }

  // 1. Candidate Contact Query: "What is my phone number?", "my phone", "my email"
  if (
    /\b(what is my phone|what's my phone|my phone|my phone number|my telephone|my mobile|my contact)\b/i.test(lower)
  ) {
    return {
      intent: "candidate_contact_query",
      filterCriteria,
      confidence: 0.95,
    };
  }

  // 2. Assistant Contact Query: "Give me your phone number", "what is your phone"
  if (
    /\b(your phone|phone number|telephone|mobile number|call you|reach you by phone|your number|give me your phone)\b/i.test(lower)
  ) {
    return {
      intent: "contact_query",
      filterCriteria,
      confidence: 0.95,
    };
  }

  // 3. Check Apply to Job intent
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

  // 4. View Tracked Applications Intent
  if (
    lower.includes("my applications") ||
    lower.includes("applied jobs") ||
    lower.includes("show applications") ||
    lower.includes("tracked jobs") ||
    lower.includes("show my applied") ||
    lower.includes("my tracked") ||
    lower === "applications"
  ) {
    return {
      intent: "track_applications",
      filterCriteria,
      confidence: 0.9,
    };
  }

  // 5. Greeting Intent
  if (
    /^(hi|hello|hey|greetings|good morning|good afternoon|good evening)\b/i.test(lower) &&
    lower.split(/\s+/).length <= 4
  ) {
    return {
      intent: "greeting",
      filterCriteria,
      confidence: 0.9,
    };
  }

  // 6. Resume Status / Upload Intent
  if (
    lower.includes("upload resume") ||
    lower.includes("parse resume") ||
    lower.includes("my resume") ||
    lower.includes("resume status") ||
    lower.includes("who am i") ||
    lower.includes("what are my skills")
  ) {
    if (lower.includes("find jobs matching") || lower.includes("match my resume") || lower.includes("matching my resume") || lower.includes("matching my uploaded resume")) {
      return {
        intent: "job_search",
        filterCriteria,
        confidence: 0.95,
      };
    }

    return {
      intent: hasActiveProfile ? "resume_status" : "resume_upload",
      filterCriteria,
      confidence: 0.85,
    };
  }

  // 7. Help Intent
  if (
    lower === "help" ||
    lower.includes("what can you do") ||
    lower.includes("how does this work")
  ) {
    return {
      intent: "help",
      filterCriteria,
      confidence: 0.9,
    };
  }

  // 8. Entity Extraction for Job Searches and Refinements
  // Remote filter
  if (
    lower.includes("remote") ||
    lower.includes("wfh") ||
    lower.includes("work from home") ||
    lower.includes("telecommute")
  ) {
    filterCriteria.remoteOnly = true;
  }

  // Experience level filter (e.g. internships, 0-2 years, entry-level, senior)
  if (lower.includes("intern") || lower.includes("student")) {
    filterCriteria.experienceLevel = "intern";
  } else if (
    /\b(0[-–\s]*2|0\s*to\s*2)\s*(?:years?|yrs?)?\b/i.test(lower) ||
    lower.includes("entry-level") ||
    lower.includes("entry level") ||
    lower.includes("junior")
  ) {
    filterCriteria.experienceLevel = "0-2 years (Entry / Junior)";
  } else if (
    /\b(1[-–\s]*3|1\s*to\s*3)\s*(?:years?|yrs?)?\b/i.test(lower) ||
    lower.includes("associate")
  ) {
    filterCriteria.experienceLevel = "1-3 years (Associate / Mid)";
  } else if (
    /\b(3[-–\s]*5|3\s*to\s*5)\s*(?:years?|yrs?)?\b/i.test(lower) ||
    lower.includes("mid-senior")
  ) {
    filterCriteria.experienceLevel = "3-5 years (Mid-Senior)";
  } else if (
    /\b(5\+|\b5\s*or\s*more)\s*(?:years?|yrs?)?\b/i.test(lower) ||
    lower.includes("senior") ||
    lower.includes("lead") ||
    lower.includes("principal")
  ) {
    filterCriteria.experienceLevel = "5+ years (Senior / Lead)";
  }

  // Min match score filter (e.g. "at least 70% match", "70% match")
  const minScoreMatch = lower.match(/\b(?:at least|minimum|min|>=?)\s*(\d+)%\s*(?:match)?\b|\b(\d+)%\s*(?:match|compatibility)\b/);
  if (minScoreMatch) {
    const scoreVal = parseInt(minScoreMatch[1] || minScoreMatch[2], 10);
    if (!isNaN(scoreVal) && scoreVal > 0 && scoreVal <= 100) {
      filterCriteria.minScore = scoreVal;
    }
  }

  // Skills filter from common list
  const extractedSkills: string[] = [];
  for (const skill of COMMON_SKILLS) {
    const reg = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (reg.test(text)) {
      extractedSkills.push(skill);
    }
  }

  // Skills filter from "requiring X and Y" syntax
  const requiringMatch = text.match(/\brequiring\s+([A-Za-z0-9#+.]+(?:\s+(?:and|&|,)\s+[A-Za-z0-9#+.]+)*)/i);
  if (requiringMatch) {
    const rawSkills = requiringMatch[1]
      .split(/\s+(?:and|&|,)\s+/i)
      .map((s) => s.replace(/[.,;!?]+$/, "").trim());
    for (const rs of rawSkills) {
      if (rs.length > 1 && !extractedSkills.some((s) => s.toLowerCase() === rs.toLowerCase())) {
        extractedSkills.push(rs);
      }
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

  // Location filter (e.g. "in India", "in Berlin", "in Germany", "in Munich", "in London")
  const locMatch = text.match(/\bin\s+([A-Za-z\s]+?)(?:$|[.,;!?])/i);
  if (locMatch) {
    const candidateLoc = locMatch[1].trim();
    const blacklist = [
      "the", "a", "an", "all", "our", "my", "your", "remote", "general",
      "software", "tech", "total", "engineering", "short", "detail", "english", "german"
    ];
    if (!blacklist.includes(candidateLoc.toLowerCase()) && candidateLoc.length >= 2) {
      filterCriteria.location = candidateLoc;
    }
  }

  // Company filter (e.g. "from AcmeCorp", "from NonExistent", "company AcmeCorp")
  const companyMatch = text.match(/\b(?:from|company)\s+([A-Za-z0-9&.\s]+?)(?:$|[.,;!?])/i);
  if (companyMatch) {
    const candidateComp = companyMatch[1].trim();
    const compBlacklist = [
      "the", "a", "an", "all", "our", "my", "your", "remote", "home",
      "scratch", "india", "europe", "germany", "berlin", "london", "least"
    ];
    if (!compBlacklist.includes(candidateComp.toLowerCase()) && candidateComp.length >= 2) {
      if (!filterCriteria.query) {
        filterCriteria.query = candidateComp;
      }
    }
  }

  // 9. Check if Refine Search vs New Search
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

  // 10. General Job Search check
  if (
    lower.includes("job") ||
    lower.includes("role") ||
    lower.includes("find") ||
    lower.includes("search") ||
    lower.includes("show") ||
    lower.includes("looking for") ||
    extractedSkills.length > 0 ||
    filterCriteria.remoteOnly ||
    filterCriteria.location ||
    filterCriteria.experienceLevel
  ) {
    return {
      intent: "job_search",
      filterCriteria,
      confidence: 0.8,
    };
  }

  return {
    intent: "unknown",
    filterCriteria,
    confidence: 0.3,
  };
}
