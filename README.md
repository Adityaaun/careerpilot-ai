# CareerPilot AI — Autonomous Job Matching & Career Agent

> **Hidani Tech SDE Intern Assessment (AI Agents & Automation)**  
> Production-ready, full-stack conversational AI career assistant built with Next.js 16, TypeScript, PostgreSQL persistence, and Arbeitnow job verification.

**Demo Video:** [Watch the CareerPilot AI walkthrough](https://drive.google.com/file/d/1hbxQh_LTGLcTicvL6nYjToXnO-zQBiJF/view?usp=sharing)

[![Tests](https://img.shields.io/badge/tests-95%20passed%20(100%25)-success)](./tests)
[![Dataset](https://img.shields.io/badge/jobs-1%2C600%20verified-blue)](./data/jobs.json)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Deployment](https://img.shields.io/badge/deployment-Vercel%20Live-brightgreen)](https://careerpilot-ai-beta-lovat.vercel.app/)

---

## 🌟 Executive Overview

CareerPilot AI is an end-to-end full-stack agentic career assistant designed to solve the real problems candidates face when searching and applying for technical roles. It combines a conversational AI orchestrator, deterministic scoring engine, and robust database persistence to provide reliable job matching, natural-language filtering, and duplicate-free application tracking.

### Key Capabilities

1. **Conversational Resume Parsing**: Upload PDF or DOCX resumes (up to 5MB) directly inside chat or via modal. Extracts candidate name, contact details (email, phone, LinkedIn, GitHub, website), designation, skills, experience, education, and projects with strict Zod validation.
2. **Explainable Real-Time Job Matching**: Evaluates candidates against a normalized dataset of **1,600 verified real job listings** from Arbeitnow. Generates heuristic compatibility scores (0–100%) broken down into skills (50%), title alignment (30%), and experience (20%) with transparent reasoning. Word-boundary matching prevents accidental substring collisions (e.g. Go vs Django, Java vs JavaScript, C vs React).
3. **Conversational Filter Refinement**: Supports natural language modifications (e.g., *"show only remote jobs"*, *"filter by React and TypeScript"*, *"jobs requiring Python and 0-2 years experience"*, *"jobs with at least 70% match"*).
4. **Context-Aware Ordinal Tool Execution**: Understands relative conversational references such as *"apply to job 1"*, *"apply to the second one"*, or direct job IDs (`arb_...`).
5. **Durable Database Persistence & Duplicate Prevention**: Powered by PostgreSQL (Neon / Supabase) with connection pooling and database-level `UNIQUE(user_id, job_id)` composite constraints. Prevents duplicate submissions and guarantees that tracked applications survive server restarts and browser refreshes.
6. **Active Storage Health & Zero Silent Fallback**: Live `SELECT 1` ping verifies active database availability. If `DATABASE_URL` is configured but unavailable, the API returns HTTP 503 rather than silently degrading to ephemeral local storage.
7. **Application Lifecycle Tracking**: Interactive status progression (`tracked` $\rightarrow$ `submitted` $\rightarrow$ `interviewing` $\rightarrow$ `offered` $\rightarrow$ `rejected`) persisted via `PATCH /api/applications`.
8. **Robust AI Agent with Deterministic Fallback**: Handles intent routing, extracts candidate contact info from authentic resume data, and strictly refuses to fabricate contacts or phone numbers. Operates at 100% functionality even when no external LLM API key is present.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | Next.js 16.4.2 (App Router) | Full-stack React framework with Turbopack |
| **Language** | TypeScript 5 | Strict typing across all components, tools, and endpoints |
| **Styling** | Tailwind CSS v4 & Lucide Icons | Dark-themed, responsive glassmorphism UI |
| **Validation** | Zod 4 | Runtime schema validation for profiles, jobs, applications, and chat |
| **Persistence (Prod)** | PostgreSQL (`pg.Pool`) | Connection-pooled relational storage with composite user scoping |
| **Persistence (Local)** | Mutexed Atomic JSON | File-locked zero-config local storage for offline development |
| **Document Parsing** | `pdf-parse` v2 + `mammoth` | Server-side binary extraction for PDF and Word DOCX |
| **AI Orchestration** | Custom Agent + `@google/genai` | Multi-step agent with deterministic intent routing and Gemini LLM integration |
| **Testing** | Vitest 5 | 95 automated unit, component, safety, and database tests (100% pass) |

---

## 🏛️ System Architecture & Data Flow

```mermaid
flowchart TD
    User["Candidate / Browser"] <--> UI["Next.js App Router UI"]

    subgraph Frontend["Presentation Layer"]
        UI --> Chat["Chat Interface & State"]
        UI --> Upload["Resume Dropzone Modal"]
        UI --> Cards["Job Recommendation Cards"]
        UI --> Tracker["Applications Drawer"]
        UI <--> StorageLocal[("Browser LocalStorage - Session/Profile Cache")]
    end

    subgraph API["Next.js Route Handlers"]
        Chat <--> RouteChat["/api/chat"]
        Upload --> RouteResume["/api/resume/parse"]
        Cards --> RouteJobs["/api/jobs/search"]
        Tracker <--> RouteApp["/api/applications - GET, POST, PATCH"]
    end

    subgraph Agent["Orchestrator & Tools"]
        RouteChat --> Orchestrator["Orchestrator Agent"]
        Orchestrator <--> IntentParser["Contextual Intent & Filter Parser"]
        Orchestrator <--> LLM["Gemini SDK / Deterministic Engine"]
        Orchestrator --> ToolResume["Resume Parser Tool"]
        Orchestrator --> ToolMatch["Job Matcher Tool"]
        Orchestrator --> ToolApply["Application Recording Tool"]
        Orchestrator --> ToolTrack["Tracking Tool"]
    end

    subgraph Data["Persistence Layer"]
        ToolMatch <--> JobsDataset[("data/jobs.json: 1,600 Verified Listings")]
        ToolApply <--> DBRouter{"DATABASE_URL configured?"}
        ToolTrack <--> DBRouter
        DBRouter -- "Yes (Production)" --> PostgresDB[("PostgreSQL Database: Neon/Supabase")]
        DBRouter -- "No (Local Dev)" --> LocalStore[("Local JSON Fallback Store")]
    end
```

### End-to-End Dataflow
1. **Resume Ingestion**: The candidate uploads a `.pdf` or `.docx` file. `/api/resume/parse` extracts text via server-side binary streams, parses structured sections with Zod, and returns candidate data.
2. **Matching & Ranking**: The candidate profile is evaluated against 1,600 verified job listings in `data/jobs.json`. Jobs are ranked by heuristic match scores (0–100%) and filtered by constraints.
3. **Conversational Refinement**: The candidate requests refinements (e.g., *"show remote jobs only"*, *"require React and TypeScript"*). `intentParser` parses criteria, enforces strict multi-skill inclusion, and returns updated matches.
4. **Authoritative Application Tracking**: When a candidate tracks a job (via UI button or saying *"Apply to job 1"*), `/api/applications` validates the job ID against `data/jobs.json`, executes an idempotent `INSERT ... ON CONFLICT (job_id) DO NOTHING` in PostgreSQL, and returns the persisted record.
5. **Session & Refresh Continuity**: When the page is reloaded, `page.tsx` fetches authoritative records from `/api/applications` and restores active chat messages and profile from client storage.

---

## 🔌 API Endpoints Reference

### 1. `POST /api/resume/parse`
Parses an uploaded PDF or DOCX file into a structured candidate profile.
- **Content-Type**: `multipart/form-data` (Field: `file`)
- **Response**:
```json
{
  "success": true,
  "profile": {
    "name": "Alex Smith",
    "contact": { "email": "alex.smith@example.com", "phone": "(555) 234-5678" },
    "designation": "Senior Full Stack Engineer",
    "yearsOfExperience": 4,
    "skills": ["TypeScript", "React", "Next.js", "Node.js", "PostgreSQL", "AWS"],
    "experience": [...],
    "education": [...],
    "projects": [...]
  },
  "sourceFileName": "alex_smith.pdf",
  "fileSizeBytes": 24510
}
```

### 2. `POST /api/jobs/search`
Searches and ranks jobs from the 1,600 dataset based on candidate compatibility.
- **Request Body**:
```json
{
  "profile": { ... },
  "filters": { "remoteOnly": true, "skills": ["React", "TypeScript"], "minScore": 70, "limit": 10 }
}
```
- **Response**:
```json
{
  "success": true,
  "count": 10,
  "results": [
    {
      "job": {
        "id": "arb_senior-frontend-developer-remote-352991",
        "title": "Senior Frontend Developer",
        "company": "TechCorp",
        "location": "Berlin, Germany",
        "remote": true,
        "experience_required": "5+ years (Senior / Lead)",
        "skills": ["React", "TypeScript", "Next.js"],
        "source_url": "https://www.arbeitnow.com/jobs/..."
      },
      "matchScore": 88,
      "matchedSkills": ["React", "TypeScript", "Next.js"],
      "missingSkills": [],
      "matchReason": "Matches 3 key skills (React, TypeScript, Next.js). Strong title alignment with your Senior Full Stack Engineer background."
    }
  ]
}
```

### 3. `POST /api/chat`
Conversational orchestrator supporting intent routing, ordinal resolution, tool execution, and deterministic fallback.
- **Request Body**:
```json
{
  "message": "Apply to job 1",
  "candidateProfile": { ... },
  "context": { "lastJobMatches": [ ... ] }
}
```
- **Response**:
```json
{
  "success": true,
  "message": "Your application for Senior Frontend Developer at TechCorp has been tracked in CareerPilot AI...",
  "intent": "apply_to_job",
  "application": {
    "id": "app_1792607082977_y3k7b",
    "jobId": "arb_senior-frontend-developer-remote-352991",
    "jobTitle": "Senior Frontend Developer",
    "company": "TechCorp",
    "sourceUrl": "https://www.arbeitnow.com/jobs/...",
    "applicationDate": "2026-10-21T18:24:42.977Z",
    "status": "tracked"
  },
  "storage": "postgres",
  "provider": "deterministic-fallback"
}
```

### 4. `GET /api/applications`
Retrieves all recorded applications from the database or local storage.
- **Response**:
```json
{
  "success": true,
  "count": 1,
  "storage": "postgres",
  "applications": [
    {
      "id": "app_1792607082977_y3k7b",
      "jobId": "arb_senior-frontend-developer-remote-352991",
      "jobTitle": "Senior Frontend Developer",
      "company": "TechCorp",
      "location": "Berlin, Germany",
      "sourceUrl": "https://www.arbeitnow.com/jobs/...",
      "status": "tracked",
      "applicationDate": "2026-10-21T18:24:42.977Z",
      "updatedAt": "2026-10-21T18:24:42.977Z"
    }
  ]
}
```

### 5. `POST /api/applications`
Tracks an application record. Enforces duplicate prevention and job ID validation.
- **Request Body**:
```json
{
  "jobId": "arb_it-system-engineer-bochum-76111",
  "jobTitle": "IT-System Engineer (m/w/d)",
  "company": "think about IT GmbH",
  "location": "Bochum",
  "sourceUrl": "https://www.arbeitnow.com/jobs/...",
  "candidateName": "Alex Smith"
}
```
- **Response (Success - HTTP 201)**:
```json
{
  "success": true,
  "message": "Application tracked successfully",
  "storage": "postgres",
  "application": { ... }
}
```
- **Response (Already Tracked - HTTP 409)**:
```json
{
  "success": false,
  "alreadyTracked": true,
  "message": "Application already tracked for this job.",
  "storage": "postgres",
  "application": { ... }
}
```

### 6. `PATCH /api/applications`
Updates the status of an existing application record.
- **Request Body**:
```json
{
  "id": "app_1792607082977_y3k7b",
  "status": "interviewing",
  "notes": "Technical screening scheduled"
}
```
- **Response (Success - HTTP 200)**:
```json
{
  "success": true,
  "message": "Application status updated to interviewing",
  "storage": "postgres",
  "application": { "id": "app_1792607082977_y3k7b", "status": "interviewing", "updatedAt": "..." }
}
```

### 7. `DELETE /api/applications`
Deletes an application record scoped to the authenticated or demo user.
- **Query Parameter**: `?id=app_...` (or JSON body: `{ "id": "app_..." }`)
- **Headers (Optional)**: `x-user-id: <user_id>` (defaults to `'demo_user'`)
- **Response (Success - HTTP 200)**:
```json
{
  "success": true,
  "message": "Application \"app_1792607082977_y3k7b\" deleted successfully.",
  "storage": "postgres"
}
```
- **Response (Not Found - HTTP 404)**:
```json
{
  "success": false,
  "error": "Application with ID \"app_1792607082977_y3k7b\" was not found for this user.",
  "storage": "postgres"
}
```
- **Response (Missing ID - HTTP 400)**:
```json
{
  "success": false,
  "error": "Application ID is required via query parameter (?id=...) or JSON body."
}
```

---

## 🎯 Heuristic Job Matching Algorithm

CareerPilot AI uses a transparent, deterministic compatibility scoring formula:

$$\text{Compatibility Score} = \text{Skill Match (50\%)} + \text{Role Alignment (30\%)} + \text{Experience Alignment (20\%)}$$

> [!NOTE]
> The compatibility percentage is an explainable heuristic match score based on resume keywords and requirements. It is not an objectively validated hiring probability guarantee.

1. **Skill Overlap (50 points max)**:
   - Evaluates the intersection of candidate skills with job requirements and description.
   - Normalizes tech aliases (e.g., `Node` = `Node.js`, `k8s` = `Kubernetes`, `ReactJS` = `React`).
   - Match ratio: $(\text{matched} / \text{required}) \times 50$.
   - Missing required skills are surfaced explicitly to help candidates prepare.
2. **Title & Role Alignment (30 points max)**:
   - Evaluates keyword overlap and designation seniority (e.g., *Frontend*, *Backend*, *Full Stack*, *DevOps*, *Intern*).
   - Exact or strong match = 30 pts; partial alignment = 20 pts; general technical role = 10 pts.
3. **Experience Compatibility (20 points max)**:
   - Matches candidate years of experience against seniority tiers:
     - `Internship / Student`: 0–2 years (20 pts)
     - `0-2 years (Entry / Junior)`: 0–3 years (20 pts)
     - `1-3 years (Associate / Mid)`: 1–4 years (20 pts)
     - `3-5 years (Mid-Senior)`: 3–6 years (20 pts)
     - `5+ years (Senior / Lead)`: 5+ years (20 pts)
   - Candidates with little experience are not awarded high scores on 5+ year Senior positions without an explanatory penalty.
4. **Deterministic Tie-Breaking**:
   - `matchScore` DESC $\rightarrow$ `matchedSkills.length` DESC $\rightarrow$ `job.title` ASC.

---

## 📊 Dataset Provenance & Verification Audit

- **Primary Source**: [Arbeitnow Public Tech Job Board API](https://www.arbeitnow.com/blog/job-board-api)
- **Total Listings**: **1,600 verified real job records** in `data/jobs.json`.
- **Audit Findings**:
  - `0` duplicate job IDs (`1,600` unique IDs).
  - `0` missing or malformed required fields (`title`, `company`, `location`, `source_url`, `description`).
  - `0` empty, placeholder, or suspiciously short descriptions.
  - `0` invalid URL formats.
  - `37` multi-location listings (same company hiring for the identical title across multiple European hubs or remote options; each assigned a unique `arb_...` ID).
  - Sample URLs verified with live HTTP HEAD requests returning `HTTP 200 OK`.
  - Geographic distribution: Germany, Netherlands, UK, Spain, France, and Europe-wide Remote.
- **Reproducing and Validating the Dataset**:
```bash
# Fetch and normalize 1,600 authentic listings directly from Arbeitnow API
npm run data:collect

# Validate dataset count, schema compliance, uniqueness, and distributions
npm run data:validate

# Verify sample URLs and detailed field statistics
npx tsx scripts/verify_dataset_sample.ts
```

---

## 💾 Database Persistence & Schema

### PostgreSQL Schema
CareerPilot AI runs automatic schema initialization and non-destructive migration on startup when connected to PostgreSQL. The schema is scoped by user identity (`user_id`, defaulting to `'demo_user'` for the single-user assessment demo):

```sql
CREATE TABLE IF NOT EXISTS applications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) DEFAULT 'demo_user' NOT NULL,
  job_id VARCHAR(128) NOT NULL,
  job_title VARCHAR(256) NOT NULL,
  company VARCHAR(256) NOT NULL,
  location VARCHAR(256),
  source_url TEXT,
  status VARCHAR(64) DEFAULT 'tracked',
  notes TEXT,
  candidate_name VARCHAR(256),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_applications_user_job UNIQUE(user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_applications_user_job ON applications(user_id, job_id);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);
```

### Duplicate Prevention & Privacy Strategy
- **Database Level Composite Constraint**: `UNIQUE(user_id, job_id)` prevents the same candidate from creating duplicate records for a job, while allowing distinct users in a multi-tenant environment to track identical positions.
- **Concurrent Race Protection**: Concurrent tracking requests are guarded by PostgreSQL atomicity (`INSERT ... ON CONFLICT (user_id, job_id) DO NOTHING`). Duplicates return a structured HTTP 409 Conflict.
- **Active Connection Health Check**: `testPostgresConnection()` executes an active `SELECT 1` ping. If `DATABASE_URL` is configured but PostgreSQL is unreachable, the system returns an honest HTTP 503 error rather than silently falling back to ephemeral local file storage on Vercel.
- **Deployment Scope & Privacy**: Designed as an assessment demo with single-tenant isolation (`demo_user`), with privacy-safe in-memory resume processing. All queries accept an optional `x-user-id` header to seamlessly support multi-user authentication without schema changes.
- **Distinction**:
  - `Tracked in CareerPilot AI`: Application metadata stored on the candidate's personal board.
  - `Applied to Employer`: User clicked official employer URL to submit their application directly. Never fabricated or asserted without external confirmation.

---

## 🚀 Local Installation & Setup

### 1. Prerequisites
- **Node.js**: v20+ (tested on Node v22.15.0)
- **npm**: v10+

### 2. Clone and Install
```bash
git clone https://github.com/Adityaaun/careerpilot-ai.git
cd careerpilot-ai
npm install
```

### 3. Environment Variables
Create `.env.local` based on `.env.example`:
```bash
cp .env.example .env.local
```

```env
# PostgreSQL Database URL (Neon / Supabase / Local Postgres)
# Leave empty for automatic local JSON storage fallback
DATABASE_URL=postgresql://user:password@ep-example-pooler.region.neon.tech/neondb?sslmode=require

# Dedicated Disposable PostgreSQL Database for Integration Tests (Optional)
# MUST NOT point to production or match DATABASE_URL. If omitted, integration tests fail closed safely.
TEST_DATABASE_URL=postgresql://test_user:test_password@localhost:5433/careerpilot_test

# Google Gemini API Key (Optional — operates in Deterministic Mode if empty)
GEMINI_API_KEY=

# Preferred AI Provider
AI_PROVIDER=gemini

# Dataset & Storage Paths
JOBS_DATASET_PATH=./data/jobs.json
APPLICATIONS_STORAGE_PATH=./data/applications.json
```

### 4. Initialize Database (Optional for PostgreSQL)
```bash
npm run db:init
```

### 5. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Run Integration Tests Safely (Dedicated Disposable PostgreSQL)
Integration tests mutate schema and application records and are **strictly blocked** from connecting to runtime or production databases (`DATABASE_URL`).
They strictly require `TEST_DATABASE_URL` pointing to an isolated, disposable test database:

```bash
# Spin up a dedicated, disposable local PostgreSQL test container on port 5433
docker run -d --name careerpilot-test-db \
  -e POSTGRES_USER=test_user \
  -e POSTGRES_PASSWORD=test_password \
  -e POSTGRES_DB=careerpilot_test \
  -p 5433:5432 \
  postgres:16-alpine

# Run integration tests against the disposable container
TEST_DATABASE_URL="postgresql://test_user:test_password@localhost:5433/careerpilot_test" npm run test:integration

# Stop and clean up the container when finished
docker rm -f careerpilot-test-db
```

---

## 🧪 Test & Verification Results

All automated tests have been executed and verified in the repository:

### Test Suite Summary
- **Total Automated Test Suites**: 12 files
- **Total Automated Tests**: **95 / 95 passed (100%)**
- **Unit, Component & Mocked Tests**: **93 tests passed** (execute fully offline with zero database dependencies)
- **Database Safety Guard Tests**: **7 tests passed** (verify all fail-closed database guards without live connections)
- **Integration Test Safety**: **2 tests passed** (verify offline storage fallback and safe fail-closed reporting when disposable database credentials are unset)
- **Live Integration Tests**: Reported as **BLOCKED** when `TEST_DATABASE_URL` is unset or matches production; passes when a dedicated disposable database is provided.

### Database Integration Test Safety Guard
Integration tests enforce strict safety via `src/lib/db/testSafetyGuard.ts`:
1. **No Production Fallback**: Integration tests **never** fall back to `DATABASE_URL`.
2. **Missing / Empty Variable**: If `TEST_DATABASE_URL` is missing or blank, tests fail closed with zero database connections attempted.
3. **Identical Target Rejection**: Rejects connection targets whose host, port, and database match `DATABASE_URL`.
4. **Cloud Production Host Blocking**: Rejects managed cloud production hosts (`*.neon.tech`, `*.supabase.co`, `*.rds.amazonaws.com`, etc.).
5. **Production Database Name Blocking**: Rejects database names containing `prod`, `production`, or `neondb`.
6. **Malformed URL Validation**: Rejects syntactically invalid URLs before connection initialization.
7. **Connection Isolation**: Integration helpers use an isolated `customPool?: Pool` without altering application runtime database state.

### Detailed Test Results Breakdown

| Test Suite / File | Scope | Tests | Result |
| :--- | :--- | :---: | :--- |
| `tests/conversationalAgent.test.ts` | 19 natural-language intent scenarios & fallback | 19 | **PASS** |
| `tests/jobMatcher.test.ts` | Word-boundary matching, alias normalization, and scoring | 14 | **PASS** |
| `tests/orchestrator.test.ts` | Agent routing, ordinal resolution, tool dispatch | 12 | **PASS** |
| `tests/applicationStore.test.ts` | Quarantining corrupted storage, mutex locking, zero-fallback | 11 | **PASS** |
| `tests/resumeParser.test.ts` | PDF/DOCX extraction, contact extraction, Zod validation | 10 | **PASS** |
| `tests/applicationsDrawer.test.ts` | Escape key lifecycle, backdrop clicks, dialog accessibility | 10 | **PASS** |
| `tests/testSafetyGuard.test.ts` | Failsafe DB guards: missing URL, identical target, cloud prod | 7 | **PASS** |
| `tests/databasePersistence.test.ts` | Composite unique constraints, schema migrations, status | 5 | **PASS** |
| `tests/chatApi.test.ts` | Chat endpoint input validation & response schemas | 3 | **PASS** |
| `tests/postgresIntegration.test.ts` | Safety guard fail-closed verification & local health check | 2 | **PASS** (Live DB: **BLOCKED** when unset) |
| `tests/validateJobs.test.ts` | 1,600 Arbeitnow dataset schema & integrity verification | 1 | **PASS** |
| `tests/smoke.test.ts` | System environment and core module exports smoke check | 1 | **PASS** |
| **Total Automated Suite** | **Full Vitest Suite (12 files)** | **95** | **95 / 95 PASS (100%)** |

### Build & Static Verification
| Check | Command | Result |
| :--- | :--- | :--- |
| **ESLint** | `npm run lint` | **0 errors, 0 warnings** |
| **TypeScript** | `npx tsc --noEmit` | **0 errors (strict mode)** |
| **Production Build** | `npm run build` | **Compiled cleanly (exit code 0)** |
| **Dataset Validation** | `npm run data:validate` | **1,600 valid, 0 invalid, 0 dupes** |

---

## 🌐 Production Deployment

### Live Vercel Deployment
- **Production URL**: [https://careerpilot-ai-beta-lovat.vercel.app/](https://careerpilot-ai-beta-lovat.vercel.app/)
- **GitHub Repository**: [https://github.com/Adityaaun/careerpilot-ai](https://github.com/Adityaaun/careerpilot-ai)

### Configuring PostgreSQL on Vercel (Neon / Supabase)
To enable persistent database storage on the live deployment:
1. Create a free serverless PostgreSQL instance on [Neon](https://neon.tech) or [Supabase](https://supabase.com).
2. Copy the pooled connection string (e.g. `postgresql://...@ep-...-pooler.neon.tech/neondb?sslmode=require`).
3. Open the **Vercel Project Dashboard** $\rightarrow$ **Settings** $\rightarrow$ **Environment Variables**.
4. Add variable:
   - Key: `DATABASE_URL`
   - Value: `<your-postgres-connection-string>`
   - Environments: `Production`, `Preview`, `Development`
5. Click **Save** and trigger a **Redeploy**.
6. The top nav badge on the live site will automatically switch from `Local Dev Store` to `PostgreSQL DB`.

---

## 🔒 Privacy & Data Retention Notes

- **Resume Files**: Uploaded PDF/DOCX files are processed in-memory in serverless memory streams. Raw binary resume files are never saved to disk or permanent databases.
- **Candidate Data**: Extracted profile information (skills, designation, contact info) is cached in the user's browser `localStorage` and sent with search requests to compute compatibility scores.
- **Session Control**: A "Reset Chat" button in the header allows candidates to clear local session memory and conversation history without deleting their saved application records in the database.

---

## ⚠️ Known Limitations

1. **Dataset Geographic Focus**: The 1,600 Arbeitnow tech listings are primarily located in Germany, the Netherlands, UK, Spain, and Europe-wide Remote. Searches for other regions (such as India) transparently return 0 matches with an honest explanatory message rather than fabricating jobs.
2. **External Application Submission**: CareerPilot AI acts as an intelligent career tracker. It tracks jobs internally and provides direct links to official employer postings. It does not submit third-party employer web forms without candidate review.
3. **Single-Tenant Database Mode**: Without a user authentication system (not required by the assessment specification), all records in the database belong to the current deployment. In multi-user production, user identity tokens or Supabase Auth would be introduced.
