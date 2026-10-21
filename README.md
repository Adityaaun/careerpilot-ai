# CareerPilot AI — Autonomous Job Matching & Career Agent

> **Hidani Tech SDE Intern Assessment (AI Agents & Automation)**  
> A production-ready, full-stack conversational AI career assistant that parses resumes, matches real jobs using explainable scoring, handles natural-language filters, and tracks applications without duplicates.

---

## 🌟 Executive Overview

CareerPilot AI is an end-to-end full-stack agentic web application built with **Next.js 16 (App Router)**, **TypeScript**, and **Tailwind CSS**. It combines an agentic orchestrator with a deterministic rule engine to deliver fast, reliable job recommendations and safe application tracking.

### Key Capabilities

1. **Conversational Resume Parsing**: Upload PDF or DOCX resumes (up to 5MB) directly inside chat or via modal. Extracts candidate name, contact details (email, phone, LinkedIn, GitHub, website), designation, skills, experience, education, and projects with strict Zod validation.
2. **Explainable Real-Time Job Matching**: Evaluates candidates against a normalized dataset of **1,600 verified real job listings** from Arbeitnow. Generates match scores (0–100%) broken down into skills (50%), title alignment (30%), and experience (20%) with transparent reasoning.
3. **Conversational Filter Refinement**: Supports natural language modifications (e.g., *"show only remote jobs"*, *"filter by React and TypeScript"*, *"jobs requiring Python"*).
4. **Context-Aware Ordinal Tool Execution**: Understands relative conversational references such as *"apply to job 1"*, *"apply to the second one"*, or direct job IDs.
5. **Safe Application Recording & Tracking**: Validates job IDs against the real dataset, prevents duplicate submissions, stores records with dates and statuses, and provides instant tracking drawers.
6. **Robust Error Handling**: Clear feedback for oversized/corrupted files, unsupported formats, zero matching results, invalid job IDs, and API quota limits.
7. **Zero-API-Key Deterministic Fallback**: Fully functional without any external LLM API key. When a Gemini API key is configured, it enriches conversational responses and polish.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | Next.js 16.4.2 (App Router) | Full-stack React framework with Turbopack |
| **Language** | TypeScript 5 | Strict typing across all components, tools, and endpoints |
| **Styling** | Tailwind CSS v4 & Lucide Icons | Dark-themed, responsive glassmorphism UI |
| **Validation** | Zod 4 | Runtime schema validation for profiles, jobs, applications, and chat |
| **Document Parsing** | `pdf-parse` v2 + `mammoth` | Server-side binary extraction for PDF and Word DOCX |
| **AI Orchestration**| Custom Agent + `@google/genai` | Multi-step agent with deterministic intent routing and Gemini LLM integration |
| **Storage** | Atomic JSON + `/tmp` + `localStorage` | Write-mutexed persistence resilient to serverless cold starts |
| **Testing** | Vitest 5 | 43 automated unit/integration tests + 28 live acceptance checks |

---

## 🏛️ System Architecture & Data Flow

```mermaid
graph TD
    User([User / Browser]) <--> UI[Next.js App Router UI]
    
    subgraph Frontend [Presentation Layer]
        UI --> Chat[Chat Interface & State]
        UI --> Upload[Resume Dropzone Modal]
        UI --> Cards[Job Recommendation Cards]
        UI --> Tracker[Applications Drawer]
        UI <--> StorageLocal[(Browser LocalStorage)]
    end

    subgraph API [Next.js Route Handlers]
        Chat <--> RouteChat[/api/chat]
        Upload --> RouteResume[/api/resume/parse]
        Cards --> RouteJobs[/api/jobs/search]
        Tracker <--> RouteApp[/api/applications]
    end

    subgraph Agent [Orchestrator & Tools]
        RouteChat --> Orchestrator[Orchestrator Agent]
        Orchestrator <--> IntentParser[Contextual Intent & Filter Parser]
        Orchestrator <--> LLM[Gemini 2.5 SDK / Deterministic Engine]
        Orchestrator --> ToolResume[Resume Parser Tool]
        Orchestrator --> ToolMatch[Job Matcher Tool]
        Orchestrator --> ToolApply[Application Recording Tool]
        Orchestrator --> ToolTrack[Tracking Tool]
    end

    subgraph Data [Persistent Data Layer]
        ToolResume --> Schemas[(Zod Schemas)]
        ToolMatch <--> JobsDataset[(data/jobs.json: 1,600 Verified Listings)]
        ToolApply <--> AppStorage[(data/applications.json / /tmp Storage)]
        ToolTrack <--> AppStorage
    end
```

### End-to-End Dataflow
1. **Resume Submission**: The candidate uploads a `.pdf` or `.docx` file. `/api/resume/parse` validates file size (<5MB) and mime type, extracts text via binary streams, and extracts candidate details.
2. **Matching & Ranking**: The candidate's skills and designation are scored against 1,600 listings in `data/jobs.json`. Jobs are ranked by match percentage and filtered by constraints.
3. **Conversational Refinement**: The user messages the assistant (e.g. *"show remote only"*). The `intentParser` updates filter state and recalculates matches.
4. **Application Recording**: The user says *"apply to job 1"*. The agent resolves the ordinal reference to the active job card, verifies the job ID, checks for duplicates, and writes the application record.
5. **Session Continuity**: Both the parsed profile and tracked applications are synchronized to `localStorage` and server-side storage, ensuring seamless page refresh persistence.

---

## 🔌 Supported API Endpoints

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
Searches and ranks jobs from the 1,600 dataset based on profile compatibility.
- **Request Body**:
```json
{
  "profile": { ... },
  "filters": { "remoteOnly": true, "skills": ["React"], "limit": 10 }
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
Conversational orchestrator supporting intent routing, ordinal resolution, and tool execution.
- **Request Body**:
```json
{
  "message": "Apply to job 1",
  "profile": { ... },
  "currentJobs": [ ... ],
  "activeFilters": { "remoteOnly": true }
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
    "applicationDate": "2026-10-21T18:24:42.977Z",
    "status": "tracked"
  },
  "provider": "deterministic-fallback"
}
```

### 4. `GET /api/applications`
Retrieves all recorded applications from the persisted store.
- **Response**:
```json
{
  "success": true,
  "count": 1,
  "applications": [
    {
      "id": "app_1792607082977_y3k7b",
      "jobId": "arb_senior-frontend-developer-remote-352991",
      "jobTitle": "Senior Frontend Developer",
      "company": "TechCorp",
      "status": "tracked",
      "applicationDate": "2026-10-21T18:24:42.977Z"
    }
  ]
}
```

---

## 🎯 Job Matching Algorithm & Score Explanation

CareerPilot AI uses a deterministic, explainable scoring formula with zero hallucination:

$$\text{MatchScore} = \text{SkillScore (50\%)} + \text{RoleScore (30\%)} + \text{ExperienceScore (20\%)}$$

1. **Skill Overlap (50 pts max)**:
   - Evaluates the intersection of candidate skills with job requirements and description.
   - If a job lists specific tech tags, match ratio = $(\text{matched} / \text{required}) \times 50$.
   - Unmatched requirements are surfaced as `missingSkills`.
2. **Title & Role Alignment (30 pts max)**:
   - Uses token overlap and designation hierarchy matching (e.g. *"Full Stack"*, *"Frontend"*, *"DevOps"*, *"Intern"*).
   - Exact or strong title match = 30 pts; partial alignment = 20 pts; general technical role = 10 pts.
3. **Experience Level Compatibility (20 pts max)**:
   - Compares candidate years of experience against job seniority buckets:
     - `Internship / Student`: 0–2 years (20 pts)
     - `0-2 years (Entry / Junior)`: 0–3 years (20 pts)
     - `1-3 years (Associate / Mid)`: 1–4 years (20 pts)
     - `3-5 years (Mid-Senior)`: 3–6 years (20 pts)
     - `5+ years (Senior / Lead)`: 5+ years (20 pts)
4. **Deterministic Tie-Breaking**:
   - `matchScore` DESC $\rightarrow$ `matchedSkills.length` DESC $\rightarrow$ `job.id` ASC.

---

## 📊 Dataset Provenance & Collection Procedure

- **Source**: [Arbeitnow Free Public Job Board API](https://www.arbeitnow.com/blog/job-board-api)
- **Record Count**: **1,600 verified authentic listings** in `data/jobs.json`.
- **Validation**:
  - `0` duplicate job IDs.
  - `0` duplicate `(title | company | url)` content keys.
  - `100%` compliance with Zod `JobListingSchema`.
  - `133` verified remote listings.
  - Real company names (Amazon, Qualinx, Delivery Hero, etc.) and direct live URLs.
- **Reproducing the Dataset**:
```bash
# Fetch and normalize 1,600 authentic listings directly from Arbeitnow API
npm run data:collect

# Validate dataset count, schema compliance, uniqueness, and distributions
npm run data:validate
```

---

## 💾 Application Tracking & Persistence Architecture

CareerPilot AI uses a multi-tier persistence model:

1. **Server-Side File Persistence**:
   - Application records are saved via serialized write queue (`writeQueue`) with atomic temporary file renaming to prevent corruption during concurrent requests.
2. **Serverless Lambda Support (`/tmp`)**:
   - On Vercel and serverless platforms where repository directories are read-only, `applicationStore.ts` automatically switches storage to `/tmp/applications.json`.
3. **In-Memory Graceful Fallback**:
   - If filesystem access is restricted, operations fallback to an in-process cache (`memoryFallbackStore`).
4. **Client-Side Session Synchronization**:
   - `page.tsx` synchronizes applied jobs and parsed candidate profile to browser `localStorage` on every change, ensuring user applications persist across cold starts.
5. **Duplicate Prevention**:
   - Every application request checks for an existing record with matching `jobId`. If already tracked, it returns the existing record with an alert rather than creating a duplicate.

---

## 🚀 Installation & Local Setup

### 1. Prerequisites
- **Node.js**: v20+ (tested on Node v22.15.0)
- **npm**: v10+ (tested on npm 11.13.0)

### 2. Clone and Install
```bash
git clone https://github.com/Adityaaun/careerpilot-ai.git
cd careerpilot-ai
npm install
```

### 3. Environment Variables
Copy the template file:
```bash
cp .env.example .env.local
```
Configure `.env.local`:
```env
# Google Gemini API Key (Optional — operates in Deterministic Mode if empty)
GEMINI_API_KEY=

# Preferred Provider
AI_PROVIDER=gemini

# Dataset & Storage Paths
JOBS_DATASET_PATH=./data/jobs.json
APPLICATIONS_STORAGE_PATH=./data/applications.json
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

---

## 🧪 Test & Validation Commands

All commands have been verified and pass locally:

| Command | Purpose | Verification Result |
| :--- | :--- | :--- |
| `npm test` | Run Vitest unit & integration test suite | **43 / 43 passed** in ~900ms |
| `npm run lint` | Run strict ESLint checks | **0 errors, 0 warnings** |
| `npm run build` | Compile Next.js Turbopack production bundle | **Compiled successfully** in ~900ms |
| `npm run data:validate` | Validate 1,600 dataset integrity | **1,600 valid, 0 invalid, 0 dupes** |
| `npm run test:workflow` | Run full 28-step end-to-end acceptance suite | **28 / 28 passed** against live server |

---

## 🌐 Production Deployment Guide

CareerPilot AI is optimized for deployment to **Vercel** or **Render**:

### Deploying to Vercel (Recommended)
1. Fork or push this repository to GitHub: `https://github.com/Adityaaun/careerpilot-ai`.
2. Go to [Vercel Dashboard](https://vercel.com/new).
3. Import the `careerpilot-ai` repository.
4. Framework Preset: **Next.js** (detected automatically).
5. Build Command: `next build` (default).
6. Environment Variables (optional):
   - `GEMINI_API_KEY`: your Google Gemini API key.
7. Click **Deploy**. Vercel will build and provide a live URL (e.g. `https://careerpilot-ai.vercel.app`).

---

## 🔗 Public Links

- **Public GitHub Repository**: [https://github.com/Adityaaun/careerpilot-ai](https://github.com/Adityaaun/careerpilot-ai)
- **Live Deployed Application**: *(To be populated upon Vercel project linking)*
- **Demo Video Recording**: *(To be populated upon screen recording)*

---

## 📹 3–5 Minute Demo Narration Script

Use this script during the assessment screen recording:

| Time | Scene | Narration & Action |
| :--- | :--- | :--- |
| **0:00 – 0:30** | Landing Page Overview | *"Hello! This is CareerPilot AI, an autonomous AI career assistant built for the Hidani Tech SDE Intern assessment. It helps software engineers parse resumes, discover matches across 1,600 real job listings, refine results conversationally, and track job applications safely."* |
| **0:30 – 1:15** | Resume Parsing | *Click '📄 Upload Resume' button $\rightarrow$ Select PDF or DOCX resume.*<br>*"I'll upload a resume. CareerPilot's parser extracts candidate name, contact details, current designation, and tech skills with strict validation, rendering a profile card instantly."* |
| **1:15 – 2:00** | Explainable Job Matching | *Click '🎯 Match My Resume' or type 'Find jobs matching my resume'.*<br>*"CareerPilot evaluates my profile against 1,600 authentic job listings from Arbeitnow. Each card shows the transparent match percentage broken down into skills, title alignment, and experience level, plus direct links to the official posting."* |
| **2:00 – 2:45** | Natural Language Filtering | *Type: 'Show only remote jobs' $\rightarrow$ Then type: 'Show jobs requiring React'.*<br>*"I can refine recommendations conversationally. Filtering for remote jobs updates the cards to exclusively remote roles. Adding React further refines the skill requirements in real-time."* |
| **2:45 – 3:30** | Application Tracking & Duplicates | *Type: 'Apply to job 1' $\rightarrow$ Inspect confirmation $\rightarrow$ Type: 'Apply to job 1' again.*<br>*"CareerPilot understands relative references like 'Apply to job 1'. It tracks the application into our local tracker. If I try applying again, it recognizes the existing submission and prevents duplicate records."* |
| **3:30 – 4:00** | Application Drawer & Architecture | *Click 'Applications' drawer in the top right $\rightarrow$ View tracked applications.*<br>*"The Applications drawer shows our submission history with timestamps. The system features a deterministic rule-based fallback, so it remains 100% functional even when external LLMs are unavailable. Thank you!"* |

---

## ⚠️ Known Limitations & Future Improvements

1. **Local Tracking Scope**: CareerPilot AI acts as a personal candidate assistant and tracking tool. It does not submit external employer portal forms on third-party sites without user redirection. Direct employer application URLs are provided on every card.
2. **Serverless Filesystem Volatility**: On ephemeral platforms like Vercel Lambda, the filesystem `/tmp` directory resets on container recycle. Client-side `localStorage` mirroring ensures candidate continuity across browser sessions. Connecting an external database (e.g. Supabase PostgreSQL or Upstash Redis) would enable multi-device sync.
3. **Scraped Skill Dictionary**: Heuristic skill extraction utilizes a dictionary of ~100 core tech keywords. Candidate skills outside this dictionary are preserved in raw text summary.
