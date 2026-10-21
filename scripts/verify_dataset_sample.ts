import fs from "fs";
import { JobListing } from "../src/lib/types/job";

async function main() {
  const jobs: JobListing[] = JSON.parse(fs.readFileSync("data/jobs.json", "utf8"));
  console.log(`Auditing dataset: ${jobs.length} total jobs.`);

  // Check 1: Duplicate IDs
  const idMap = new Map<string, number>();
  for (const j of jobs) {
    idMap.set(j.id, (idMap.get(j.id) || 0) + 1);
  }
  const duplicateIds = Array.from(idMap.entries()).filter(([, count]) => count > 1);
  console.log(`Duplicate IDs: ${duplicateIds.length}`);

  // Check 2: Content Keys (title + company)
  const titleCompanyMap = new Map<string, number>();
  for (const j of jobs) {
    const key = `${j.title.toLowerCase().trim()}|${j.company.toLowerCase().trim()}`;
    titleCompanyMap.set(key, (titleCompanyMap.get(key) || 0) + 1);
  }
  const duplicateContent = Array.from(titleCompanyMap.entries()).filter(([, count]) => count > 1);
  console.log(`Duplicate Title+Company combinations: ${duplicateContent.length}`);

  // Check 3: Missing/empty fields
  const missingTitle = jobs.filter((j) => !j.title || j.title.trim().length === 0);
  const missingCompany = jobs.filter((j) => !j.company || j.company.trim().length === 0);
  const missingLocation = jobs.filter((j) => !j.location || j.location.trim().length === 0);
  const missingUrl = jobs.filter((j) => !j.source_url || !j.source_url.startsWith("http"));
  const shortDesc = jobs.filter((j) => !j.description || j.description.trim().length < 50);

  console.log(`Missing title: ${missingTitle.length}`);
  console.log(`Missing company: ${missingCompany.length}`);
  console.log(`Missing location: ${missingLocation.length}`);
  console.log(`Invalid source_url: ${missingUrl.length}`);
  console.log(`Descriptions < 50 chars: ${shortDesc.length}`);

  // Check 4: Test 5 sample source URLs live via HEAD request
  console.log("\nTesting live HTTP reachable status for 5 sample listings:");
  const sampleIndices = [0, 100, 500, 1000, 1500];
  for (const idx of sampleIndices) {
    const job = jobs[idx];
    try {
      const res = await fetch(job.source_url, {
        method: "HEAD",
        headers: { "User-Agent": "CareerPilot-Audit/1.0" },
        redirect: "follow",
      });
      console.log(`Sample #${idx} [${job.id}]: HTTP ${res.status} | "${job.title}" @ ${job.company}`);
    } catch (err) {
      console.log(`Sample #${idx} [${job.id}]: Fetch error - ${(err as Error).message}`);
    }
  }
}

main().catch(console.error);
