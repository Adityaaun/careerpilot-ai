import fs from "fs";
import path from "path";

import { JobListing } from "../src/lib/types/job";

const LIVE_URL = "https://careerpilot-ai-beta-lovat.vercel.app";

async function runAudit() {
  console.log("=== PHASE 7 & PHASE 3: LIVE PRODUCTION ENDPOINT AUDIT ===");
  console.log("Target:", LIVE_URL);
  const dir = path.join(process.cwd(), "tests", "fixtures", "synthetic");

  let firstJob: JobListing | null = null;

  // 1. GET /api/jobs/search (Empty / default search)
  try {
    const res1 = await fetch(`${LIVE_URL}/api/jobs/search?limit=5`);
    const data1 = await res1.json();
    firstJob = data1.results?.[0]?.job;
    console.log(`[API-01] GET /api/jobs/search?limit=5 -> Status: ${res1.status}, Count: ${data1.count}, First Title: "${firstJob?.title}"`);
  } catch (err) {
    console.error("[API-01] Error:", err);
  }

  // 2. GET /api/jobs/search with filters (query=Python, remote=true)
  try {
    const res2 = await fetch(`${LIVE_URL}/api/jobs/search?query=Python&remote=true&limit=5`);
    const data2 = await res2.json();
    console.log(`[API-02] GET /api/jobs/search?query=Python&remote=true -> Status: ${res2.status}, Count: ${data2.count}, First Title: "${data2.results?.[0]?.job?.title}", Remote: ${data2.results?.[0]?.job?.isRemote}`);
  } catch (err) {
    console.error("[API-02] Error:", err);
  }

  // 3. GET /api/applications (List stored applications)
  try {
    const res3 = await fetch(`${LIVE_URL}/api/applications`);
    const data3 = await res3.json();
    console.log(`[API-03] GET /api/applications -> Status: ${res3.status}, Applications Count: ${data3.applications?.length}`);
  } catch (err) {
    console.error("[API-03] Error:", err);
  }

  // 4. POST /api/applications - Track duplicate prevention
  try {
    const realJob = firstJob;
    if (realJob) {
      const realApp = {
        jobId: realJob.id,
        jobTitle: realJob.title,
        company: realJob.company,
        location: realJob.location,
        candidateName: "Audit Tester",
        status: "applied"
      };
      const postRes1 = await fetch(`${LIVE_URL}/api/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(realApp)
      });
      const postData1 = await postRes1.json();
      console.log(`[API-04a] POST /api/applications (Real Job ID: ${realJob.id}) -> Status: ${postRes1.status}, Success: ${postData1.success}, Message: ${postData1.message || postData1.error}`);

      const postRes2 = await fetch(`${LIVE_URL}/api/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(realApp)
      });
      const postData2 = await postRes2.json();
      console.log(`[API-04b] POST /api/applications (Duplicate submit of ${realJob.id}) -> Status: ${postRes2.status}, Success: ${postData2.success}, Error: ${postData2.error}`);
    }
  } catch (err) {
    console.error("[API-04] Error:", err);
  }

  // 5. POST /api/applications - Missing fields validation
  try {
    const res5 = await fetch(`${LIVE_URL}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: "Incomplete Corp" })
    });
    const data5 = await res5.json();
    console.log(`[API-05] POST /api/applications (Missing jobId/jobTitle) -> Status: ${res5.status}, Success: ${data5.success}, Error: ${data5.error}`);
  } catch (err) {
    console.error("[API-05] Error:", err);
  }

  // 6. POST /api/resume/parse - DOCX
  try {
    const docxData = fs.readFileSync(path.join(dir, "sarah_jenkins_resume.docx"));
    const formData = new FormData();
    formData.append("file", new Blob([docxData], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "sarah_jenkins_resume.docx");
    const res6 = await fetch(`${LIVE_URL}/api/resume/parse`, { method: "POST", body: formData });
    const data6 = await res6.json();
    console.log(`[API-06] POST /api/resume/parse (DOCX) -> Status: ${res6.status}, Success: ${data6.success}, Candidate: ${data6.profile?.name}, Skills: ${data6.profile?.skills?.join(", ")}`);
  } catch (err) {
    console.error("[API-06] Error:", err);
  }

  // 7. POST /api/resume/parse - PDF
  try {
    const pdfData = fs.readFileSync(path.join(dir, "alex_smith_resume.pdf"));
    const formData = new FormData();
    formData.append("file", new Blob([pdfData], { type: "application/pdf" }), "alex_smith_resume.pdf");
    const res7 = await fetch(`${LIVE_URL}/api/resume/parse`, { method: "POST", body: formData });
    const data7 = await res7.json();
    console.log(`[API-07] POST /api/resume/parse (PDF) -> Status: ${res7.status}, Success: ${data7.success}, Candidate: ${data7.profile?.name}, Skills: ${data7.profile?.skills?.length || 0}, Error: ${data7.error || "None"}`);
  } catch (err) {
    console.error("[API-07] Error:", err);
  }

  // 8. POST /api/resume/parse - Unsupported TXT
  try {
    const txtData = fs.readFileSync(path.join(dir, "unsupported_document.txt"));
    const formData = new FormData();
    formData.append("file", new Blob([txtData], { type: "text/plain" }), "unsupported_document.txt");
    const res8 = await fetch(`${LIVE_URL}/api/resume/parse`, { method: "POST", body: formData });
    const data8 = await res8.json();
    console.log(`[API-08] POST /api/resume/parse (Unsupported TXT) -> Status: ${res8.status}, Success: ${data8.success}, Error: ${data8.error}`);
  } catch (err) {
    console.error("[API-08] Error:", err);
  }

  // 9. POST /api/resume/parse - Empty file (0 bytes)
  try {
    const emptyData = fs.readFileSync(path.join(dir, "empty_resume.pdf"));
    const formData = new FormData();
    formData.append("file", new Blob([emptyData], { type: "application/pdf" }), "empty_resume.pdf");
    const res9 = await fetch(`${LIVE_URL}/api/resume/parse`, { method: "POST", body: formData });
    const data9 = await res9.json();
    console.log(`[API-09] POST /api/resume/parse (Empty 0 bytes) -> Status: ${res9.status}, Success: ${data9.success}, Error: ${data9.error}`);
  } catch (err) {
    console.error("[API-09] Error:", err);
  }

  // 10. POST /api/chat - Conversational intent
  try {
    const res10 = await fetch(`${LIVE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Find Python and Docker roles" })
    });
    const data10 = await res10.json();
    console.log(`[API-10] POST /api/chat -> Status: ${res10.status}, Intent: ${data10.intent}, Jobs returned: ${data10.jobs?.length}, Reply snippet: "${data10.message?.substring(0, 70)}..."`);
  } catch (err) {
    console.error("[API-10] Error:", err);
  }

  console.log("=== COMPLETED LIVE PRODUCTION ENDPOINT AUDIT ===");
}

runAudit();
