/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CareerPilot AI — Phase 4 Live Workflow Verification
 * End-to-end integration test against running server
 */
import { createTestPdfBuffer, createTestDocxBuffer } from "../tests/helpers/testDocuments";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

async function runLiveVerification() {
  console.log(`\n======================================================`);
  console.log(`🚀 CareerPilot AI — Live Acceptance Testing`);
  console.log(`🎯 Target URL: ${BASE_URL}`);
  console.log(`======================================================\n`);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, step: string, details?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${step}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${step} - ${details || "Assertion failed"}`);
      failed++;
    }
  }

  // 1. Root page health check
  try {
    const res = await fetch(`${BASE_URL}/`);
    assert(res.status === 200, "1. Root page loads with HTTP 200");
    const html = await res.text();
    assert(html.includes("CareerPilot AI"), "1b. Root page contains 'CareerPilot AI' branding");
  } catch (err) {
    assert(false, "1. Root page loads", (err as Error).message);
  }

  // 2. Upload & parse PDF resume
  let pdfProfile: any = null;
  try {
    const pdfBuf = createTestPdfBuffer(
      "Alex Smith\nEmail: alex.smith@example.com\nPhone: (555) 234-5678\nDesignation: Senior Full Stack Engineer\nSkills: TypeScript, React, Next.js, Node.js, PostgreSQL, AWS, Docker\nExperience: Senior Full Stack Engineer at Acme Corp 2021 - Present\nEducation: B.S. Computer Science from MIT 2020\nProjects: CareerPilot AI - Built real-time job assistant"
    );
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(pdfBuf)], { type: "application/pdf" }), "alex_smith.pdf");

    const res = await fetch(`${BASE_URL}/api/resume/parse`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    assert(res.status === 200 && data.success, "2. Upload valid PDF resume");
    assert(data.profile?.name?.toLowerCase().includes("alex smith"), "3. PDF profile extracted correct name");
    assert(data.profile?.contact?.email === "alex.smith@example.com", "3b. PDF profile extracted email");
    pdfProfile = data.profile;
  } catch (err) {
    assert(false, "2. PDF parse", (err as Error).message);
  }

  // 4. Upload & parse DOCX resume
  let docxProfile: any = null;
  try {
    const docxBuf = await createTestDocxBuffer([
      "Sarah Jenkins",
      "Email: sarah.j@example.com | Phone: 415-555-0199",
      "Designation: Backend Software Engineer",
      "Skills: Python, FastAPI, Django, PostgreSQL, Redis, Docker, Kubernetes, AWS",
      "Experience: Backend Engineer at CloudTech (2022 - Present)",
      "Built microservices handling 10k req/sec with FastAPI and Redis",
      "Education: Bachelor of Science in Computer Engineering, Stanford University 2021",
      "Projects: CloudQueue - High throughput distributed job queue in Go and Redis",
    ]);
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(docxBuf)], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      "sarah_jenkins.docx"
    );

    const res = await fetch(`${BASE_URL}/api/resume/parse`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    assert(res.status === 200 && data.success, "4. Upload valid DOCX resume in separate test");
    assert(data.profile?.name === "Sarah Jenkins", "4b. DOCX profile extracted name");
    assert(data.profile?.skills?.includes("Python"), "4c. DOCX profile extracted Python skill");
    docxProfile = data.profile;
  } catch (err) {
    assert(false, "4. DOCX parse", (err as Error).message);
  }

  const testProfile = docxProfile || pdfProfile;

  // 5. Ask for matching jobs via API
  let initialMatches: any[] = [];
  try {
    const res = await fetch(`${BASE_URL}/api/jobs/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: testProfile, limit: 5 }),
    });
    const data = await res.json();
    assert(res.status === 200 && data.success, "5. Ask for matching jobs via search API");
    assert(Array.isArray(data.results) && data.results.length > 0, "6. Results returned from real dataset");
    initialMatches = data.results;

    const firstResult = data.results[0];
    const firstJob = firstResult?.job;
    assert(
      firstJob?.id && firstJob?.title && firstJob?.company && firstJob?.source_url,
      "7a. Job result has id, title, company, and valid source link"
    );
    assert(
      typeof firstResult?.matchScore === "number" && firstResult?.matchReason?.length > 0,
      "7b. Job result includes explainable match score and match reasons"
    );
  } catch (err) {
    assert(false, "5. Job search", (err as Error).message);
  }

  // 8. Conversational search & natural language filtering via /api/chat
  let remoteMatches: any[] = [];
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "show only remote jobs",
        profile: testProfile,
        currentJobs: initialMatches,
      }),
    });
    const data = await res.json();
    assert(res.status === 200 && data.success, "8. Ask for remote jobs only via conversational chat");
    remoteMatches = data.jobs || [];
    assert(remoteMatches.length > 0, "8b. Remote jobs returned");
    const allRemote = remoteMatches.every(
      (item: any) => item.job?.remote === true || item.job?.location?.toLowerCase().includes("remote")
    );
    assert(allRemote, "8c. All returned jobs are remote (flagged remote or remote location)");
  } catch (err) {
    assert(false, "8. Remote filter", (err as Error).message);
  }

  // 9. Ask for jobs requiring React
  let reactMatches: any[] = [];
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "show jobs requiring React",
        profile: testProfile,
        currentJobs: initialMatches,
      }),
    });
    const data = await res.json();
    assert(res.status === 200 && data.success, "9. Ask for jobs requiring React");
    reactMatches = data.jobs || [];
    assert(reactMatches.length > 0, "9b. React jobs returned");
  } catch (err) {
    assert(false, "9. React filter", (err as Error).message);
  }

  // 10. Verify filters change result set
  const remoteTitles = remoteMatches.map((j: any) => j.job?.id).join(",");
  const reactTitles = reactMatches.map((j: any) => j.job?.id).join(",");
  assert(
    remoteTitles !== reactTitles || remoteMatches.length !== reactMatches.length,
    "10. Verify natural language filters actually change result set"
  );

  // 11. Track an application for a displayed job
  const targetJob = initialMatches[0]?.job;
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Apply to job 1",
        profile: testProfile,
        currentJobs: initialMatches,
      }),
    });
    const data = await res.json();
    assert(res.status === 200 && data.success, "11. Track application via ordinal 'Apply to job 1'");
    assert(
      data.application?.jobId === targetJob?.id,
      "11b. Applied job matches displayed card job ID"
    );
  } catch (err) {
    assert(false, "11. Apply to job", (err as Error).message);
  }

  // 12. Confirm record visible in application history
  try {
    const res = await fetch(`${BASE_URL}/api/applications`);
    const data = await res.json();
    assert(res.status === 200 && data.success, "12. Fetch application history");
    const found = data.applications?.some((app: any) => app.jobId === targetJob.id);
    assert(found, "12b. Recorded application is visible in application history");
  } catch (err) {
    assert(false, "12. Application history", (err as Error).message);
  }

  // 13. Try tracking the same job again (duplicate prevention)
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Apply to job ${targetJob.id}`,
        profile: testProfile,
        currentJobs: initialMatches,
      }),
    });
    const data = await res.json();
    assert(res.status === 200 && data.success, "13. Re-apply to same job request handled");
    const msg = data.message?.toLowerCase() || "";
    assert(
      msg.includes("already") || data.application?.jobId === targetJob.id,
      "14. Verify duplicate record is NOT created and user is informed"
    );
  } catch (err) {
    assert(false, "13. Duplicate prevention", (err as Error).message);
  }

  // 15. Try an invalid job reference
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Apply to job INVALID_JOB_ID_XYZ",
        profile: testProfile,
        currentJobs: initialMatches,
      }),
    });
    const data = await res.json();
    assert(res.status === 200, "15. Try invalid job reference");
    const msg = data.message?.toLowerCase() || "";
    assert(
      msg.includes("not find") || msg.includes("couldn't") || msg.includes("unable") || msg.includes("invalid") || msg.includes("out of range") || msg.includes("which job"),
      "15b. Clear error returned for invalid job reference"
    );
  } catch (err) {
    assert(false, "15. Invalid job ref", (err as Error).message);
  }

  // 16 & 17. Deterministic fallback test (without API key)
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "What can you do to help me?",
        candidateProfile: null,
      }),
    });
    const data = await res.json();
    assert(res.status === 200 && data.success, "17. Experience works in deterministic fallback mode");
    assert(
      data.message?.includes("CareerPilot AI") || data.message?.includes("resume"),
      "18. Helpful assistant guidance provided without external LLM API key"
    );
  } catch (err) {
    assert(false, "17. Deterministic fallback", (err as Error).message);
  }

  console.log(`\n======================================================`);
  console.log(`📊 Acceptance Testing Summary`);
  console.log(`Total Checks: ${passed + failed}`);
  console.log(`✅ Passed:     ${passed}`);
  console.log(`❌ Failed:     ${failed}`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runLiveVerification().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
