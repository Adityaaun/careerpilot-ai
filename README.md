# CareerPilot AI — Autonomous Job Matching & Career Agent

> **Hidani Tech SDE Intern Assessment**  
> A production-minded, full-stack AI career assistant that parses resumes, matches real jobs using explainable scoring, handles natural-language conversational queries, and tracks applications.

---

## 🌟 Executive Overview

CareerPilot AI is an end-to-end full-stack agentic web application built on **Next.js 16 (App Router)**, **TypeScript**, and **Tailwind CSS**. It combines a tool-using AI orchestrator with a deterministic rule engine to deliver fast, reliable job recommendations and application management.

### Key Capabilities

1. **Conversational Resume Parsing**: Drop or upload PDF and DOCX files directly inside the chat. Extracts candidate name, contact details, current designation, tech skills, work experience, education, and projects with strict validation.
2. **Explainable Real-Time Job Matching**: Evaluates candidates against a normalized dataset of 1,500–2,000 real job listings. Provides transparent match percentages, overlapping skills, missing requirements, and official source links.
3. **Conversational Filter Refinement**: Supports natural language modifications (e.g., *"show only remote jobs"*, *"filter by React and TypeScript"*, *"jobs for 0-2 years experience"*).
4. **Application Recording & Tracking**: Validates job IDs, prevents duplicate submissions, stores records with dates and statuses, and provides instant tracking summaries.
5. **Robust Error Handling**: Clear feedback for corrupted/oversized files, unsupported formats, zero matching results, invalid job IDs, and API quota limits.
6. **Graceful Deterministic Fallback**: Fully functional even without an external LLM API key using an integrated rule-based orchestrator and deterministic keyword/experience matcher.

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
    end

    subgraph API [Next.js Route Handlers]
        Chat <--> RouteChat[/api/chat]
        Upload --> RouteResume[/api/resume/parse]
        Cards --> RouteJobs[/api/jobs/search]
        Tracker <--> RouteApp[/api/applications]
    end

    subgraph Agent [Orchestrator & Tools]
        RouteChat --> Orchestrator[Orchestrator Agent]
        Orchestrator <--> LLM[Gemini 2.5 / OpenAI / Deterministic Engine]
        Orchestrator --> ToolResume[Resume Parser Tool]
        Orchestrator --> ToolMatch[Job Matcher Tool]
        Orchestrator --> ToolApply[Application Tool]
        Orchestrator --> ToolTrack[Tracking Tool]
    end

    subgraph Storage [Persistent Data Layer]
        ToolResume --> Schemas[(Zod Schemas)]
        ToolMatch <--> JobsDataset[(data/jobs.json: 1,500-2,000 Listings)]
        ToolApply <--> AppStorage[(data/applications.json & Session Store)]
        ToolTrack <--> AppStorage
    end
```

---

## 📂 Project Directory Structure

```
CareerPilot AI/
├── .env.example                     # Sample environment variable template
├── .gitignore                       # Git exclusions (credentials, next build artifacts)
├── next.config.ts                   # Next.js 16 Turbopack configuration
├── package.json                     # Scripts and dependencies
├── tsconfig.json                    # Strict TypeScript configuration
├── vitest.config.mts                # Vitest test runner configuration
├── data/                            # Persistent JSON datasets and stores
│   ├── jobs.sample.json             # Verified seed development dataset (50 listings)
│   ├── jobs.json                    # Full target dataset (1,500–2,000 real listings)
│   └── applications.json            # Safe persisted application records
├── scripts/                         # Reproducible CLI utilities
│   ├── collect_jobs.ts              # Dataset collector (Arbeitnow public API)
│   └── validate_jobs.ts             # Dataset validator (schema, uniqueness, quality)
├── src/
│   ├── app/
│   │   ├── api/                     # Backend App Router endpoints
│   │   │   ├── chat/                # Orchestrator agent endpoint
│   │   │   ├── resume/parse/        # File upload and text extraction
│   │   │   ├── jobs/search/         # Job searching and ranking
│   │   │   └── applications/        # Application recording and retrieval
│   │   ├── globals.css              # Dark mode styling tokens and scrollbars
│   │   ├── layout.tsx               # Root layout with Inter font and SEO tags
│   │   └── page.tsx                 # Full-stack AI job assistant shell
│   ├── components/                  # Modular UI components
│   └── lib/                         # Core domain logic
│       ├── agent/                   # Agent orchestrator and intent routing
│       ├── tools/                   # Parser, Matcher, and Application storage
│       ├── llm/                     # Gemini/OpenAI SDK wrappers and fallback
│       └── types/                   # Zod schemas (Job, Resume, Application, Agent)
└── tests/                           # Automated test suite (Vitest)
    ├── smoke.test.ts                # Harness smoke test
    └── validateJobs.test.ts         # Dataset validation test
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v20+ (tested on Node v22.15.0)
- **npm**: v10+ (tested on npm 11.13.0)

### 2. Installation
```bash
# Clone the repository
git clone <repository-url>
cd "CareerPilot AI"

# Install dependencies
npm install
```

### 3. Environment Setup
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
*(Optional)* Add your Gemini or OpenAI API key. If left blank, CareerPilot operates seamlessly in **Deterministic Mode**.

```env
GEMINI_API_KEY=your_key_here
```

### 4. Running the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Verification & Testing Commands

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Start Next.js local development server |
| `npm run build` | Validate TypeScript and compile production bundle |
| `npm run lint` | Run ESLint with zero-tolerance checks |
| `npm test` | Run unit and integration tests via Vitest |
| `npm run data:validate` | Validate `data/jobs.json` count, uniqueness, and schema |
| `npm run data:collect` | Run reproducible scraper to fetch 1,500-2,000 real jobs |

---

## 📊 Dataset Provenance & Quality Assurance

- **Primary Source**: [Arbeitnow Free Public Job Board API](https://www.arbeitnow.com/blog/job-board-api)
  - **Legitimacy**: Official, documented, free public API with explicit terms permitting usage.
  - **Volume**: 300 real listings per page across 10+ pages, easily providing 1,500–2,000+ software, devops, and tech listings.
  - **Attributes**: Full job titles, company names, locations, remote status, job types, tech tags, descriptions, and verified direct URLs.
- **Normalization & Deduplication**:
  - HTML cleaned to plain text.
  - Experience required normalized to structured ranges (e.g., `0-2 years`, `3-5 years`, `5+ years`).
  - Deduplicated by unique job ID and compound key `(title | company | source_url)`.
- **Validation**: Enforced by `scripts/validate_jobs.ts` and automated in Vitest.

---

## 📅 Prioritized 3-Day Implementation Plan

- [x] **Phase 1: Project Foundation & Implementation Plan** *(Current)*
  - Repository inspection and Git setup
  - Next.js 16 App Router + Tailwind CSS initialization
  - TypeScript types and Zod schemas (`JobListing`, `ParsedProfile`, `ApplicationRecord`)
  - Dataset collection and validation scripts
  - Seed verified dataset (`data/jobs.sample.json` and `data/jobs.json`)
  - Initial responsive chat UI shell
  - Automated test harness and lint configuration
- [x] **Phase 2: Real Job Dataset, Resume Parser, Matching Engine & Application Storage** *(Completed)*
  - Scaled real job dataset to 1,600 verified listings via Arbeitnow public API (0 duplicates, 100% schema compliance)
  - Implemented `resumeParser.ts` supporting PDF (`pdf-parse`) and DOCX (`mammoth`) with size checks, heuristic extraction, and missing field preservation
  - Implemented `jobMatcher.ts` with 50/30/20 explainable match scoring, multi-criteria filtering, and deterministic tie handling
  - Implemented `applicationStore.ts` with atomic writes, duplicate prevention, and quarantine of corrupted storage
  - Exposed REST API endpoints (`/api/resume/parse`, `/api/jobs/search`, `/api/applications`)
  - Added 28 automated tests across 5 test suites (all passing in <1s)
- [x] **Phase 3: Agent Orchestrator, Tool Calling & Conversational Chat Integration** *(Completed)*
  - Implemented `orchestrator.ts` with intent classification (`greeting`, `resume_upload`, `job_search`, `refine_search`, `apply_to_job`, `track_applications`, `help`)
  - Implemented `intentParser.ts` resolving contextual ordinals (e.g. "apply to job 1", "second job") and natural language filter facets
  - Implemented configurable LLM provider (`client.ts`) with Gemini SDK (`@google/genai`) and reliable deterministic fallback
  - Built `/api/chat` App Router endpoint with Zod validation
  - Built rich React chat components (`ProfileSummaryCard`, `JobCard`, `ResumeDropzoneModal`, `ApplicationsDrawer`)
  - Extended Vitest suite to 43 passing tests across 7 test files (100% pass rate)
- [ ] **Phase 4: Full UI Polish, Production Deployment & Video Walkthrough**
  - Interactive profile summary card, job recommendation cards, applications drawer
  - End-to-end integration tests & edge-case validation
  - Production deployment with live URL
  - 3–5 minute video demonstration recording
