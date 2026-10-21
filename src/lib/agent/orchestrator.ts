import { ParsedProfile } from "../types/resume";
import { JobListing, JobMatchResult, JobFilterCriteria } from "../types/job";
import { ApplicationRecord } from "../types/application";
import { parseUserMessage, UserIntent } from "./intentParser";
import { matchJobs } from "../tools/jobMatcher";
import { recordApplication, listApplications } from "../tools/applicationStore";
import { getLLMStatus, callGemini } from "../llm/client";

export interface OrchestratorInput {
  userMessage: string;
  profile?: ParsedProfile;
  currentJobs?: JobMatchResult[];
  activeFilters?: JobFilterCriteria;
  customJobsDataset?: JobListing[];
  customStoragePath?: string;
}

export interface OrchestratorOutput {
  message: string;
  intent: UserIntent;
  profile?: ParsedProfile;
  jobs?: JobMatchResult[];
  application?: ApplicationRecord;
  applications?: ApplicationRecord[];
  activeFilters?: JobFilterCriteria;
  provider: "gemini" | "deterministic-fallback";
  actionTaken?: string;
  suggestedFollowUps?: string[];
  error?: string;
}

const defaultGenericProfile: ParsedProfile = {
  name: "Candidate",
  contact: { email: "", phone: "", location: "", linkedin: "", github: "", website: "" },
  designation: "Software Engineer",
  yearsOfExperience: 2,
  skills: ["JavaScript", "TypeScript", "React", "Node.js", "Python"],
  experience: [],
  education: [],
  projects: [],
  summary: "",
  rawTextLength: 0,
};

/**
 * Main AI Agent Orchestrator:
 * Manages conversational context, classifies intent, validates arguments, and dispatches tools.
 */
export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const { userMessage, profile, currentJobs = [], activeFilters = {}, customJobsDataset, customStoragePath } = input;
  const llmStatus = getLLMStatus();

  // 1. Parse user intent and extract entities
  const parsedInput = parseUserMessage(
    userMessage,
    Boolean(profile),
    currentJobs.length > 0
  );

  const { intent, targetJobRef, filterCriteria } = parsedInput;

  // 2. Handle Greeting Intent
  if (intent === "greeting") {
    let message = "";
    if (profile) {
      const topSkills = profile.skills.slice(0, 3).join(", ");
      message = `Hello ${profile.name}! I have your profile loaded as a **${profile.designation}** (${topSkills ? `skills: ${topSkills}` : `${profile.yearsOfExperience} yrs exp`}). How can I help you today? You can ask me to "find matching jobs" or "show remote roles".`;
    } else {
      message = "Hello! I am **CareerPilot AI**, your autonomous job-matching assistant. Upload your PDF or DOCX resume to get personalized recommendations, or ask me to search tech listings.";
    }

    return {
      message,
      intent,
      profile,
      activeFilters,
      provider: llmStatus.provider,
      suggestedFollowUps: [
        "📄 Upload Resume",
        "🌐 Show remote software jobs",
        "⚛️ React & Next.js roles",
        "📋 View applied jobs",
      ],
    };
  }

  // 3. Handle Resume Status / Upload Guidance Intent
  if (intent === "resume_upload" || intent === "resume_status") {
    if (profile) {
      const skillsStr = profile.skills.length > 0 ? profile.skills.slice(0, 8).join(", ") : "Not specified";
      const expCount = profile.experience.length;
      const message = `Here is a summary of your active profile:\n\n• **Name**: ${profile.name}\n• **Designation**: ${profile.designation}\n• **Experience**: ${profile.yearsOfExperience} year(s) (${expCount} past role${expCount === 1 ? "" : "s"})\n• **Key Skills**: ${skillsStr}\n• **Education**: ${profile.education[0]?.degree || "Degree"} (${profile.education[0]?.institution || "University"})\n\nWould you like me to find jobs matching these qualifications?`;

      return {
        message,
        intent: "resume_status",
        profile,
        activeFilters,
        provider: llmStatus.provider,
        suggestedFollowUps: ["🎯 Find matching jobs", "🌐 Show remote jobs only", "⚛️ Filter by React"],
      };
    } else {
      return {
        message: "You can upload your PDF or DOCX resume by clicking the **Attach Resume** button below or dragging a document into the chat. Once uploaded, I will parse your skills, experience, and projects for real-time job matching.",
        intent: "resume_upload",
        activeFilters,
        provider: llmStatus.provider,
        suggestedFollowUps: ["📄 Attach Resume", "🔍 Search jobs without resume"],
      };
    }
  }

  // 4. Handle Job Search and Refine Search Intents
  if (intent === "job_search" || intent === "refine_search") {
    // Merge previous filters with newly extracted criteria
    const mergedFilters: JobFilterCriteria = {
      ...activeFilters,
      ...filterCriteria,
      skills: [
        ...(activeFilters.skills || []),
        ...(filterCriteria.skills || []),
      ],
    };

    // Deduplicate skills
    if (mergedFilters.skills) {
      mergedFilters.skills = Array.from(new Set(mergedFilters.skills));
    }

    // Default limit
    if (!mergedFilters.limit) {
      mergedFilters.limit = 10;
    }

    const targetProfile = profile || defaultGenericProfile;
    const matched = matchJobs(targetProfile, mergedFilters, customJobsDataset);

    let message = "";
    if (matched.length === 0) {
      message = "No jobs were found matching your current filter criteria. Try broadening your search or removing some skill/location constraints.";
    } else {
      const remoteNote = mergedFilters.remoteOnly ? "remote " : "";
      const skillNote = mergedFilters.skills?.length ? `requiring ${mergedFilters.skills.join(", ")} ` : "";
      const profileNote = profile ? `matching your profile` : `based on general software engineering roles (upload your resume for personalized match scores)`;

      message = `I found **${matched.length}** ${remoteNote}${skillNote}job(s) ${profileNote}. Each recommendation includes transparent match scoring, required skills, and direct source links:`;
    }

    // Optional LLM Polish if live
    if (llmStatus.isLive && matched.length > 0) {
      const polishPrompt = `Briefly summarize that ${matched.length} jobs were found for a candidate. Mention the top 2 roles: ${matched.slice(0, 2).map((m) => `"${m.job.title}" at ${m.job.company}`).join(" and ")}. Keep it concise, friendly, and professional (under 3 sentences).`;
      const liveGen = await callGemini(polishPrompt);
      if (liveGen.success && liveGen.text) {
        message = liveGen.text.trim();
      }
    }

    return {
      message,
      intent,
      profile,
      jobs: matched,
      activeFilters: mergedFilters,
      provider: llmStatus.provider,
      actionTaken: `Executed job matching tool with ${matched.length} result(s).`,
      suggestedFollowUps: [
        "🌐 Show only remote",
        "📝 Apply to job 1",
        "⚛️ Require React & TypeScript",
        "📋 View my applied jobs",
      ],
    };
  }

  // 5. Handle Apply to Job Intent
  if (intent === "apply_to_job") {
    // A. Ambiguous Reference Resolution
    if (!targetJobRef || targetJobRef.isAmbiguous) {
      if (currentJobs.length === 0) {
        return {
          message: "No jobs are currently displayed to apply for. Please ask me to search for jobs first (e.g., 'find matching jobs').",
          intent,
          profile,
          provider: llmStatus.provider,
          suggestedFollowUps: ["🎯 Find matching jobs", "🌐 Show remote jobs"],
        };
      }

      if (currentJobs.length === 1) {
        // Unambiguous single job in view
        const targetJob = currentJobs[0].job;
        const result = await recordApplication(
          { jobId: targetJob.id, candidateName: profile?.name },
          customStoragePath,
          customJobsDataset
        );

        return {
          message: result.success
            ? `Your application for **${targetJob.title}** at **${targetJob.company}** has been tracked in CareerPilot AI.\n\n> ℹ️ **Notice**: This records your application within your local assistant tracker. To submit credentials directly to the employer, visit: [Official Job Posting](${targetJob.source_url}).`
            : `Could not track application: ${result.error}`,
          intent,
          profile,
          application: result.record,
          jobs: currentJobs,
          provider: llmStatus.provider,
          actionTaken: "Recorded application for displayed job.",
        };
      }

      // Multiple jobs displayed: ask user to clarify
      return {
        message: `Which job would you like to apply to? Please specify by number (e.g. **"apply to job 1"**, **"apply to job 2"**) or use the direct **"Track Application"** button on any job card.`,
        intent,
        profile,
        jobs: currentJobs,
        provider: llmStatus.provider,
        suggestedFollowUps: [
          `Apply to job 1 (${currentJobs[0]?.job.title.slice(0, 20)}...)`,
          currentJobs[1] ? `Apply to job 2 (${currentJobs[1]?.job.title.slice(0, 20)}...)` : "",
        ].filter(Boolean),
      };
    }

    // B. Resolve by Job Index from displayed results
    let targetJobId = targetJobRef.jobId;

    if (targetJobRef.index !== undefined) {
      const idx = targetJobRef.index;
      if (currentJobs.length === 0) {
        return {
          message: "No search results are currently active to resolve job by number. Please search for jobs first.",
          intent,
          profile,
          provider: llmStatus.provider,
        };
      }

      if (idx < 0 || idx >= currentJobs.length) {
        return {
          message: `Job number ${idx + 1} is out of range. There are currently **${currentJobs.length}** jobs displayed (numbers 1 to ${currentJobs.length}). Please specify a valid number.`,
          intent,
          profile,
          jobs: currentJobs,
          provider: llmStatus.provider,
        };
      }

      targetJobId = currentJobs[idx].job.id;
    }

    // C. Invoke Application Tool
    if (!targetJobId) {
      return {
        message: "Could not identify which job to apply to. Please specify a valid job number or ID.",
        intent,
        profile,
        jobs: currentJobs,
        provider: llmStatus.provider,
      };
    }

    const subResult = await recordApplication(
      { jobId: targetJobId, candidateName: profile?.name },
      customStoragePath,
      customJobsDataset
    );

    if (subResult.alreadyApplied) {
      return {
        message: `⚠️ **Duplicate Notice**: You have already recorded an application for **${subResult.record?.jobTitle}** at **${subResult.record?.company}**.\n\nStatus: \`${subResult.record?.status}\`\nApplied on: ${new Date(subResult.record?.applicationDate || "").toLocaleDateString()}\nOfficial Link: [View Listing](${subResult.record?.sourceUrl})`,
        intent,
        profile,
        application: subResult.record,
        jobs: currentJobs,
        provider: llmStatus.provider,
        suggestedFollowUps: ["📋 View all applied jobs", "🎯 Search more jobs"],
      };
    }

    if (!subResult.success) {
      return {
        message: `❌ Application error: ${subResult.error}`,
        intent,
        profile,
        jobs: currentJobs,
        provider: llmStatus.provider,
      };
    }

    const rec = subResult.record!;
    return {
      message: `✅ **Application Tracked Successfully!**\n\n• **Role**: ${rec.jobTitle}\n• **Company**: ${rec.company}\n• **Status**: \`${rec.status}\`\n• **Date**: ${new Date(rec.applicationDate).toLocaleString()}\n\n> ℹ️ **Transparency Notice**: CareerPilot AI has logged this application in your internal tracker. To complete your official external application, please visit: [${rec.company} Job Posting](${rec.sourceUrl}).`,
      intent,
      profile,
      application: rec,
      jobs: currentJobs,
      provider: llmStatus.provider,
      actionTaken: `Saved application record for ${rec.jobTitle}.`,
      suggestedFollowUps: ["📋 View all applied jobs", "🎯 Find more matching jobs"],
    };
  }

  // 6. Handle Track Applications Intent
  if (intent === "track_applications") {
    const apps = listApplications(customStoragePath, customJobsDataset);

    if (apps.length === 0) {
      return {
        message: "You have not tracked any job applications yet. When you see a job you like, say **\"apply to job 1\"** or click **Track Application** on the card to save it here.",
        intent,
        profile,
        applications: [],
        provider: llmStatus.provider,
        suggestedFollowUps: ["🎯 Find matching jobs", "🌐 Show remote jobs"],
      };
    }

    const summaryList = apps
      .slice(0, 5)
      .map(
        (a, i) =>
          `${i + 1}. **${a.jobTitle}** at **${a.company}** — Status: \`${a.status}\` (${new Date(a.applicationDate).toLocaleDateString()})`
      )
      .join("\n");

    const message = `You have **${apps.length}** tracked application(s):\n\n${summaryList}\n\n${apps.length > 5 ? `*(showing top 5 of ${apps.length})*` : ""}`;

    return {
      message,
      intent,
      profile,
      applications: apps,
      provider: llmStatus.provider,
      actionTaken: `Retrieved ${apps.length} application records.`,
      suggestedFollowUps: ["🎯 Find more matching jobs", "🌐 Show remote software jobs"],
    };
  }

  // 7. Handle Help / Unknown Intent
  return {
    message: "Here are some things you can ask me to do:\n\n• 📄 **\"Upload my resume\"** — Attach a PDF/DOCX to extract your skills & experience.\n• 🎯 **\"Find jobs matching my resume\"** — Rank real tech listings by compatibility.\n• 🌐 **\"Show only remote jobs\"** — Filter recommendations by remote work.\n• ⚛️ **\"Show jobs requiring React and TypeScript\"** — Filter by specific technologies.\n• 📝 **\"Apply to job 1\"** — Track an application for a displayed job.\n• 📋 **\"Show my applied jobs\"** — Review your application history and statuses.",
    intent: "help",
    profile,
    activeFilters,
    provider: llmStatus.provider,
    suggestedFollowUps: [
      "🎯 Find matching jobs",
      "🌐 Show remote software jobs",
      "📋 View my applied jobs",
    ],
  };
}
