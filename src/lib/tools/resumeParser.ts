import mammoth from "mammoth";
import zlib from "zlib";
import {
  ParsedProfile,
  ParsedProfileSchema,
  ResumeParseResult,
  ExperienceItem,
  EducationItem,
  ProjectItem,
} from "../types/resume";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const TECH_SKILLS_DICTIONARY = [
  "JavaScript", "TypeScript", "Python", "Java", "C++", "C#", "Go", "Golang", "Rust", "Ruby", "PHP", "Swift", "Kotlin", "Scala",
  "React", "React.js", "Next.js", "Vue", "Vue.js", "Angular", "Svelte", "Node.js", "Express", "Express.js", "NestJS", "FastAPI",
  "Django", "Flask", "Spring Boot", "Ruby on Rails", "Laravel", "ASP.NET", ".NET",
  "HTML", "HTML5", "CSS", "CSS3", "Tailwind CSS", "Bootstrap", "Sass", "Redux", "Zustand", "GraphQL", "REST API", "gRPC",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite", "Elasticsearch", "Cassandra", "DynamoDB", "Firebase", "Supabase", "Prisma",
  "AWS", "Amazon Web Services", "Azure", "GCP", "Google Cloud", "Docker", "Kubernetes", "Terraform", "CI/CD", "GitHub Actions",
  "Linux", "Unix", "Git", "GitHub", "GitLab", "Jira", "Agile", "Scrum",
  "Machine Learning", "Deep Learning", "PyTorch", "TensorFlow", "Pandas", "NumPy", "Scikit-Learn", "OpenCV", "NLP", "LLMs",
  "Jest", "Vitest", "Cypress", "Playwright", "Mocha", "Microservices", "System Design", "Distributed Systems"
];

const COMMON_DESIGNATIONS = [
  "Senior Full Stack Developer", "Senior Full Stack Engineer", "Senior Software Engineer", "Senior Frontend Engineer", "Senior Backend Engineer",
  "Full Stack Developer", "Full Stack Engineer", "Frontend Developer", "Frontend Engineer", "Backend Developer", "Backend Engineer",
  "Software Development Engineer", "Software Engineer", "SDE", "SDE Intern", "Software Engineering Intern",
  "DevOps Engineer", "Cloud Engineer", "Data Engineer", "Data Scientist", "Machine Learning Engineer",
  "AI Engineer", "Mobile Developer", "iOS Developer", "Android Developer", "Systems Engineer",
  "QA Engineer", "Site Reliability Engineer", "SRE", "Tech Lead", "Lead Software Engineer", "Engineering Manager"
];

/**
 * Pure-Node binary PDF stream text extractor used as a resilient fallback
 * for serverless environments (such as Vercel AWS Lambda) where external worker files may not be traced.
 */
export function extractPdfTextFallback(buffer: Buffer): string {
  const text = buffer.toString("latin1");
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let result = "";
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(text)) !== null) {
    let streamData: Buffer = Buffer.from(match[1], "latin1");
    try {
      streamData = zlib.inflateSync(streamData);
    } catch {
      // uncompressed stream data
    }
    const content = streamData.toString("latin1");
    const tjRegex = /\((.*?)\)\s*Tj/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjRegex.exec(content)) !== null) {
      result += tjMatch[1].replace(/\\([()\\])/g, "$1") + " ";
    }
    const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
    let tjaMatch: RegExpExecArray | null;
    while ((tjaMatch = tjArrayRegex.exec(content)) !== null) {
      const innerRegex = /\((.*?)\)/g;
      let innerMatch: RegExpExecArray | null;
      while ((innerMatch = innerRegex.exec(tjaMatch[1])) !== null) {
        result += innerMatch[1].replace(/\\([()\\])/g, "$1");
      }
      result += " ";
    }
  }

  // Also extract plain text literals from stream if formatting differs
  if (result.trim().length < 20) {
    const rawMatches = text.match(/\(([^()]{4,})\)/g);
    if (rawMatches) {
      result = rawMatches.map((m) => m.slice(1, -1)).join(" ");
    }
  }

  return result.trim();
}

/**
 * Extracts raw textual content from uploaded PDF or DOCX file buffer
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  filename: string,
  declaredMimeType?: string
): Promise<{ text: string; cleanFilename: string }> {
  if (!buffer || buffer.length === 0) {
    throw new Error("Uploaded file is empty (0 bytes).");
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File size (${(buffer.length / 1024 / 1024).toFixed(2)} MB) exceeds the 5 MB limit.`
    );
  }

  const cleanFilename = filename ? filename.replace(/[/\\]/g, "_").trim() : "resume.pdf";
  const ext = cleanFilename.split(".").pop()?.toLowerCase();

  const isPdf =
    ext === "pdf" ||
    declaredMimeType === "application/pdf" ||
    (buffer.length > 4 && buffer.slice(0, 4).toString() === "%PDF");

  const isDocx =
    ext === "docx" ||
    declaredMimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    (buffer.length > 4 && buffer.slice(0, 4).toString("hex") === "504b0304"); // PK zip header

  if (!isPdf && !isDocx) {
    throw new Error(
      `Unsupported file format: "${ext || declaredMimeType}". Only PDF (.pdf) and Word DOCX (.docx) files are supported.`
    );
  }

  let extractedText = "";

  if (isPdf) {
    try {
      // Ensure DOMMatrix and Path2D globals exist for pdfjs inside Node.js / Next.js server runtime
      if (typeof globalThis.DOMMatrix === "undefined") {
        (globalThis as unknown as Record<string, unknown>).DOMMatrix = class DOMMatrix {
          a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
          m11 = 1; m12 = 0; m13 = 0; m14 = 0;
          m21 = 0; m22 = 1; m23 = 0; m24 = 0;
          m31 = 0; m32 = 0; m33 = 1; m34 = 0;
          m41 = 0; m42 = 0; m43 = 0; m44 = 1;
          is2D = true;
          isIdentity = true;
        };
      }
      if (typeof globalThis.Path2D === "undefined") {
        (globalThis as unknown as Record<string, unknown>).Path2D = class Path2D {};
      }
      if (typeof globalThis.ImageData === "undefined") {
        (globalThis as unknown as Record<string, unknown>).ImageData = class ImageData {
          data: Uint8ClampedArray;
          width: number;
          height: number;
          constructor(width: number = 0, height: number = 0) {
            this.width = width;
            this.height = height;
            this.data = new Uint8ClampedArray(width * height * 4);
          }
        };
      }

      // Dynamic import / require of pdf-parse v2
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParseModule = require("pdf-parse");
      const PDFParseClass = pdfParseModule.PDFParse || pdfParseModule.default?.PDFParse;

      if (PDFParseClass) {
        const parser = new PDFParseClass({ data: buffer });
        const result = await parser.getText();
        extractedText = result.text || "";
        if (typeof parser.destroy === "function") {
          await parser.destroy();
        }
      } else if (typeof pdfParseModule === "function") {
        const data = await pdfParseModule(buffer);
        extractedText = data.text || "";
      } else {
        throw new Error("Unable to initialize PDF parsing engine.");
      }
    } catch (err) {
      // Graceful fallback: extract text directly from PDF binary streams (crucial for serverless lambdas missing pdf.worker.mjs)
      try {
        extractedText = extractPdfTextFallback(buffer);
      } catch {
        // ignore
      }
      if (!extractedText || extractedText.length < 20) {
        throw new Error(`Failed to read PDF document: ${(err as Error).message}`);
      }
    }
  } else if (isDocx) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value || "";
    } catch (err) {
      throw new Error(`Failed to read DOCX document: ${(err as Error).message}`);
    }
  }

  const normalized = extractedText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();

  if (normalized.length < 20) {
    throw new Error("File contains insufficient or unreadable text. Please provide a readable text-based resume.");
  }

  return { text: normalized, cleanFilename };
}

/**
 * Deterministic heuristic resume parser that extracts structured fields without hallucinating
 */
export function parseResumeTextHeuristic(rawText: string): ParsedProfile {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // 1. Contact Details
  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0].toLowerCase() : "";

  const phoneMatch = rawText.match(
    /(?:(?:\+?1\s*(?:[.-]\s*)?)?(?:\(\s*([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9])\s*\)|([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9]))\s*(?:[.-]\s*)?)?([2-9]1[02-9]|[2-9][02-9]1|[2-9][02-9]{2})\s*(?:[.-]\s*)?([0-9]{4})(?:\s*(?:#|x\.?|ext\.?|extension)\s*(\d+))?|(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/
  );
  const phone = phoneMatch ? phoneMatch[0].trim() : "";

  const linkedinMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);
  const linkedin = linkedinMatch ? linkedinMatch[0] : "";

  const githubMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+/i);
  const github = githubMatch ? githubMatch[0] : "";

  const portfolioMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?(?!linkedin|github)[a-zA-Z0-9.-]+\.(?:com|dev|io|me|org|app)(?:\/[^\s]*)?/i);
  const website = portfolioMatch ? portfolioMatch[0] : "";

  // 2. Candidate Name
  let name = "";
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    if (
      !line.includes("@") &&
      !line.includes("http") &&
      !line.match(/\d{3}/) &&
      !line.toLowerCase().includes("resume") &&
      !line.toLowerCase().includes("curriculum") &&
      line.length >= 2 &&
      line.length <= 40 &&
      /^[a-zA-Z\s.'-]+$/.test(line)
    ) {
      name = line;
      break;
    }
  }
  if (!name) {
    name = email ? email.split("@")[0].replace(/[._]/g, " ") : "Candidate";
  }

  // 3. Technical Skills Extraction
  const matchedSkills = new Set<string>();
  for (const skill of TECH_SKILLS_DICTIONARY) {
    const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (regex.test(rawText)) {
      matchedSkills.add(skill);
    }
  }

  // 4. Designation (prefer most specific titles first)
  let designation = "";
  const sortedDesignations = [...COMMON_DESIGNATIONS].sort((a, b) => b.length - a.length);
  for (const desig of sortedDesignations) {
    const regex = new RegExp(`\\b${desig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (regex.test(rawText)) {
      designation = desig;
      break;
    }
  }
  if (!designation) {
    designation = matchedSkills.size > 0 ? "Software Engineer" : "Technical Professional";
  }

  // 5. Section Splitting
  const sections: Record<string, string[]> = {
    experience: [],
    education: [],
    projects: [],
    summary: [],
  };

  let currentSection = "summary";
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      lower.includes("experience") ||
      lower.includes("work history") ||
      lower.includes("employment")
    ) {
      currentSection = "experience";
      continue;
    } else if (
      lower.includes("education") ||
      lower.includes("academic") ||
      lower.includes("qualification")
    ) {
      currentSection = "education";
      continue;
    } else if (
      lower.includes("project") ||
      lower.includes("personal projects") ||
      lower.includes("technical projects")
    ) {
      currentSection = "projects";
      continue;
    } else if (
      lower.includes("summary") ||
      lower.includes("objective") ||
      lower.includes("profile")
    ) {
      currentSection = "summary";
      continue;
    } else if (lower.includes("skills") || lower.includes("technologies")) {
      currentSection = "skills";
      continue;
    }

    if (sections[currentSection]) {
      sections[currentSection].push(line);
    }
  }

  // 6. Experience items
  const experienceItems: ExperienceItem[] = [];
  if (sections.experience.length > 0) {
    const expText = sections.experience.join("\n");
    const blocks = expText.split(/\n(?=[A-Z0-9][a-zA-Z0-9\s,&|-]+(?:20\d\d|19\d\d|present))/i);

    for (const b of blocks) {
      const bLines = b.split("\n").map((s) => s.trim()).filter(Boolean);
      if (bLines.length === 0) continue;

      const firstLine = bLines[0];
      const dateMatch = b.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|20\d\d|19\d\d)[\s\w–-]+(?:Present|20\d\d|19\d\d|\b)/i);
      const dates = dateMatch ? dateMatch[0].trim() : "";

      const parts = firstLine.split(/[-–|@,]/).map((p) => p.trim());
      const role = parts[0] || designation;
      const company = parts[1] || (parts.length > 2 ? parts[2] : "Company");

      const highlights = bLines.slice(1).filter((l) => l.startsWith("•") || l.startsWith("-") || l.length > 20);

      experienceItems.push({
        role,
        company,
        location: "",
        startDate: dates.split(/[-–]/)[0]?.trim() || "",
        endDate: dates.split(/[-–]/)[1]?.trim() || "Present",
        description: bLines.slice(1).join(" "),
        highlights: highlights.slice(0, 5),
      });
    }
  }

  // 7. Education items
  const educationItems: EducationItem[] = [];
  if (sections.education.length > 0) {
    const eduText = sections.education.join(" ");
    const degreeMatch = eduText.match(/(?:B\.S\.|B\.Tech|B\.E\.|Bachelor|M\.S\.|M\.Tech|Master|Ph\.D|Associate)[\w\s,.]*(?:Computer Science|Engineering|Information Technology|Science|Math)?/i);
    const gradYearMatch = eduText.match(/\b(20\d\d|19\d\d)\b/);

    const institutionMatch = eduText.match(/(?:University|Institute|College|Academy|School)[\w\s,.]+/i);

    educationItems.push({
      degree: degreeMatch ? degreeMatch[0].trim() : "Bachelor of Science",
      institution: institutionMatch ? institutionMatch[0].split(/[,\n]/)[0].trim() : "University",
      graduationYear: gradYearMatch ? gradYearMatch[0] : "",
      gpa: "",
      fieldOfStudy: degreeMatch && degreeMatch[0].includes("Computer") ? "Computer Science" : "Engineering",
    });
  }

  // 8. Projects items
  const projectItems: ProjectItem[] = [];
  if (sections.projects.length > 0) {
    const projText = sections.projects.join("\n");
    const projLines = projText.split("\n").filter((l) => l.trim().length > 0);

    for (let pIdx = 0; pIdx < Math.min(projLines.length, 6); pIdx += 2) {
      const pTitle = projLines[pIdx];
      const pDesc = projLines[pIdx + 1] || "";
      if (pTitle && pTitle.length < 60) {
        projectItems.push({
          name: pTitle.replace(/^[•\-*]\s*/, ""),
          description: pDesc,
          technologies: Array.from(matchedSkills).slice(0, 4),
          url: "",
        });
      }
    }
  }

  // 9. Years of Experience calculation
  let yearsOfExperience = 0;
  const expMatch = rawText.match(/(\d+)\+?\s*(?:years|yrs)(?:\s*of)?\s*experience/i);
  if (expMatch) {
    yearsOfExperience = parseInt(expMatch[1], 10);
  } else if (experienceItems.length > 0) {
    yearsOfExperience = Math.min(experienceItems.length * 2, 10);
  } else {
    yearsOfExperience = 1;
  }

  const profile: ParsedProfile = {
    name,
    contact: {
      email,
      phone,
      location: "",
      linkedin,
      github,
      website,
    },
    designation,
    yearsOfExperience,
    skills: Array.from(matchedSkills),
    experience: experienceItems,
    education: educationItems,
    projects: projectItems,
    summary: sections.summary.slice(0, 3).join(" "),
    rawTextLength: rawText.length,
  };

  return ParsedProfileSchema.parse(profile);
}

/**
 * High-level resume parser API
 */
export async function parseResumeFile(
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<ResumeParseResult> {
  try {
    const { text, cleanFilename } = await extractTextFromBuffer(buffer, filename, mimeType);
    const profile = parseResumeTextHeuristic(text);

    return {
      success: true,
      profile,
      sourceFileName: cleanFilename,
      fileSizeBytes: buffer.length,
    };
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message,
      sourceFileName: filename,
      fileSizeBytes: buffer?.length || 0,
    };
  }
}
