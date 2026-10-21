import fs from "fs";
import path from "path";
import { JobListing, JobListingSchema } from "../src/lib/types/job";

interface CollectionStats {
  pagesFetched: number;
  totalRaw: number;
  validParsed: number;
  duplicatesSkipped: number;
  malformedSkipped: number;
  sources: Record<string, number>;
}

function cleanHtml(html?: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]*>?/gm, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

function inferExperience(text: string, jobTypes?: string[]): string {
  const combined = `${text} ${(jobTypes || []).join(" ")}`.toLowerCase();
  if (
    combined.includes("lead") ||
    combined.includes("principal") ||
    combined.includes("staff") ||
    combined.includes("head of") ||
    combined.includes("architect") ||
    combined.includes("5+ years") ||
    combined.includes("6+ years") ||
    combined.includes("7+ years") ||
    combined.includes("8+ years") ||
    combined.includes("10+ years")
  ) {
    return "5+ years (Senior / Lead)";
  }
  if (
    combined.includes("senior") ||
    combined.includes("3-5 years") ||
    combined.includes("3+ years") ||
    combined.includes("4+ years")
  ) {
    return "3-5 years (Mid-Senior)";
  }
  if (
    combined.includes("intern") ||
    combined.includes("internship") ||
    combined.includes("working student") ||
    combined.includes("werkstudent")
  ) {
    return "Internship / Student";
  }
  if (
    combined.includes("junior") ||
    combined.includes("entry") ||
    combined.includes("associate") ||
    combined.includes("0-2 years") ||
    combined.includes("1-2 years")
  ) {
    return "0-2 years (Entry / Junior)";
  }
  return "1-3 years (Associate / Mid)";
}

function extractTechSkills(text: string, existingTags?: string[]): string[] {
  const skillDict = [
    "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "Express",
    "Python", "Django", "FastAPI", "Flask", "Java", "Spring Boot",
    "C#", ".NET", "C++", "Go", "Rust", "PHP", "Laravel", "Ruby", "Ruby on Rails",
    "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch",
    "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "CI/CD",
    "Git", "GitHub", "REST API", "GraphQL", "Microservices", "Kafka",
    "Tailwind CSS", "HTML5", "CSS3", "Vue.js", "Angular", "Svelte",
    "Machine Learning", "Deep Learning", "PyTorch", "TensorFlow", "Pandas",
    "Linux", "DevOps", "Agile", "Scrum", "Jest", "Vitest", "Playwright"
  ];

  const matched = new Set<string>();

  // Add existing tags if meaningful
  if (Array.isArray(existingTags)) {
    for (const tag of existingTags) {
      if (tag && tag.length > 1 && !tag.toLowerCase().includes("remote") && !tag.toLowerCase().includes("full-time")) {
        matched.add(tag);
      }
    }
  }

  // Scan text for tech keywords
  for (const skill of skillDict) {
    const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (regex.test(text)) {
      matched.add(skill);
    }
  }

  if (matched.size === 0) {
    matched.add("Software Development");
    matched.add("Problem Solving");
  }

  return Array.from(matched).slice(0, 15);
}

export async function fetchArbeitnowJobs(
  targetCount = 1600,
  onProgress?: (count: number) => void
): Promise<JobListing[]> {
  const jobs: JobListing[] = [];
  const seenIds = new Set<string>();
  const seenContent = new Set<string>();
  let page = 1;
  const maxPages = 15;

  console.log(`📡 Fetching live jobs from Arbeitnow Public API (Target: ${targetCount})...`);

  while (jobs.length < targetCount && page <= maxPages) {
    const url = `https://www.arbeitnow.com/api/job-board-api?page=${page}`;
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "CareerPilot-AI-DatasetCollector/1.0" },
      });

      if (!response.ok) {
        console.warn(`[Arbeitnow] HTTP ${response.status} on page ${page}, stopping.`);
        break;
      }

      const json = await response.json();
      const rawList: Array<Record<string, unknown>> = json.data || [];

      if (!rawList.length) {
        console.log(`[Arbeitnow] No more listings on page ${page}.`);
        break;
      }

      for (const raw of rawList) {
        if (jobs.length >= targetCount) break;

        const slug = typeof raw.slug === "string" ? raw.slug : "";
        const id = `arb_${slug || Math.random().toString(36).substring(2, 9)}`;
        const plainDesc = cleanHtml(typeof raw.description === "string" ? raw.description : "");
        const title = (typeof raw.title === "string" ? raw.title : "Software Engineer").trim();
        const company = (typeof raw.company_name === "string" ? raw.company_name : "Confidential").trim();
        const sourceUrl = typeof raw.url === "string" ? raw.url : `https://www.arbeitnow.com/jobs/${slug}`;

        // Deduplicate
        const contentKey = `${title.toLowerCase()}|${company.toLowerCase()}|${sourceUrl.toLowerCase()}`;
        if (seenIds.has(id) || seenContent.has(contentKey)) {
          continue;
        }

        const tags = Array.isArray(raw.tags) ? (raw.tags as string[]) : [];
        const jobTypes = Array.isArray(raw.job_types) ? (raw.job_types as string[]) : [];
        const skills = extractTechSkills(plainDesc, tags);
        const experience = inferExperience(plainDesc, jobTypes);

        const candidateJob = {
          id,
          title,
          company,
          location: (typeof raw.location === "string" ? raw.location : "") || (raw.remote ? "Remote" : "Worldwide"),
          experience_required: experience,
          skills,
          description: plainDesc.slice(0, 2500),
          source_url: sourceUrl,
          remote: Boolean(raw.remote),
          source: "arbeitnow",
          posted_at: new Date(typeof raw.created_at === "number" ? raw.created_at * 1000 : Date.now()).toISOString(),
        };

        const parsed = JobListingSchema.safeParse(candidateJob);
        if (parsed.success) {
          seenIds.add(id);
          seenContent.add(contentKey);
          jobs.push(parsed.data);
        }
      }

      onProgress?.(jobs.length);
      console.log(`  → Page ${page} processed | Total Valid Collected: ${jobs.length}`);

      if (!json.links?.next) {
        console.log(`[Arbeitnow] Reached last page: ${page}`);
        break;
      }

      page++;
      // Polite rate-limit delay
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      console.error(`[Arbeitnow] Network error on page ${page}:`, (err as Error).message);
      break;
    }
  }

  return jobs;
}

export async function runJobCollection(outputPath = "./data/jobs.json", targetCount = 1600): Promise<void> {
  const stats: CollectionStats = {
    pagesFetched: 0,
    totalRaw: 0,
    validParsed: 0,
    duplicatesSkipped: 0,
    malformedSkipped: 0,
    sources: {},
  };

  const startTime = Date.now();
  console.log(`\n======================================================`);
  console.log(`🚀 CareerPilot AI Job Dataset Collector`);
  console.log(`Target: ${targetCount} real, unique job listings`);
  console.log(`Output: ${outputPath}`);
  console.log(`======================================================\n`);

  const collected = await fetchArbeitnowJobs(targetCount, (current) => {
    stats.validParsed = current;
  });

  stats.sources["arbeitnow"] = collected.length;

  const resolvedOutput = path.resolve(outputPath);
  fs.writeFileSync(resolvedOutput, JSON.stringify(collected, null, 2), "utf-8");

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n======================================================`);
  console.log(`🎉 Collection Completed in ${durationSec}s`);
  console.log(`📦 Total Verified Listings Saved: ${collected.length}`);
  console.log(`📁 File Location:               ${resolvedOutput}`);
  console.log(`======================================================\n`);
}

// CLI runner
if (require.main === module || process.argv[1]?.includes("collect_jobs")) {
  const countArg = process.argv.find((a) => a.startsWith("--limit="));
  const target = countArg ? parseInt(countArg.split("=")[1], 10) : 1600;
  const outputArg = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "./data/jobs.json";

  runJobCollection(outputArg, target).catch((err) => {
    console.error("Fatal collection failure:", err);
    process.exit(1);
  });
}
