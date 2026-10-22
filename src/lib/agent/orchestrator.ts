import { ParsedProfile } from "../types/resume";
import { JobListing, JobMatchResult, JobFilterCriteria } from "../types/job";
import { ApplicationRecord } from "../types/application";
import { parseUserMessage, UserIntent } from "./intentParser";
import { matchJobs } from "../tools/jobMatcher";
import { recordApplication, listApplications } from "../tools/applicationStore";
import { callGemini, getLLMStatus } from "../llm/client";

export interface AgentContext {
  lastJobMatches?: JobMatchResult[];
  lastAppliedJob?: ApplicationRecord;
}

export interface OrchestratorInput {
  userMessage: string;
  profile?: ParsedProfile;
  currentJobs?: JobMatchResult[];
  activeFilters?: JobFilterCriteria;
  customJobsDataset?: JobListing[];
  customStoragePath?: string;
  userId?: string;
}

export interface OrchestratorOutput {
  message: string;
  intent: UserIntent;
  profile?: ParsedProfile;
  jobs?: JobMatchResult[];
  application?: ApplicationRecord;
  applications?: ApplicationRecord[];
  activeFilters?: JobFilterCriteria;
  suggestedFollowUps?: string[];
  provider: string;
  actionTaken?: string;
}

const defaultGenericProfile: ParsedProfile = {
  name: "Candidate",
  contact: {
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
    website: "",
  },
  designation: "Software Engineer",
  yearsOfExperience: 2,
  skills: ["TypeScript", "React", "Python", "Node.js", "SQL"],
  experience: [],
  education: [],
  projects: [],
  summary: "",
  rawTextLength: 0,
};

export async function processAgentMessage(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const {
    userMessage,
    profile,
    currentJobs = [],
    activeFilters = {},
    customJobsDataset,
    customStoragePath,
    userId = input.userId || "demo_user",
  } = input;
  const llmStatus = getLLMStatus();

  // 1. Parse user intent and extract entities
  const parsedInput = parseUserMessage(
    userMessage,
    Boolean(profile),
    currentJobs.length > 0
  );

  const { intent, targetJobRef, filterCriteria } = parsedInput;

  // 2. Handle Candidate Contact Query: "What is my phone number?"
  if (intent === "candidate_contact_query") {
    if (profile?.contact?.phone) {
      return {
        message: `According to your uploaded resume profile, your phone number is **${profile.contact.phone}**.`,
        intent: "candidate_contact_query",
        profile,
        activeFilters,
        provider: llmStatus.provider,
        suggestedFollowUps: ["🎯 Find matching jobs", "🌐 Show remote software jobs"],
      };
    }
    return {
      message: profile
        ? "Your uploaded resume profile does not list a phone number. (CareerPilot AI preserves your authentic resume details and does not fabricate contact info)."
        : "No resume profile is currently loaded. Please upload your resume first to inspect your contact details.",
      intent: "candidate_contact_query",
      profile,
      activeFilters,
      provider: llmStatus.provider,
      suggestedFollowUps: ["📄 Upload Resume", "🌐 Show remote software jobs"],
    };
  }

  // 3. Handle Assistant Contact Query (Guardrail: Never invent assistant phone numbers)
  if (intent === "contact_query") {
    return {
      message:
        "I am **CareerPilot AI**, an autonomous digital agent, so I do not have a personal telephone number, mobile line, or physical phone. I am here to help you parse resumes, discover verified tech opportunities, and track applications. How can I assist your job search today?",
      intent: "contact_query",
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

  // 4. Handle Greeting Intent
  if (intent === "greeting") {
    let message = "";
    if (profile) {
      const topSkills = profile.skills.slice(0, 3).join(", ");
      message = `Hello ${profile.name}! I have your profile loaded as a **${profile.designation}** (${topSkills ? `skills: ${topSkills}` : `${profile.yearsOfExperience} yrs exp`}). How can I help you today? You can ask me to "find matching jobs" or "show remote roles".`;
    } else {
      message =
        "Hello! I am **CareerPilot AI**, your autonomous job-matching assistant. Upload your PDF or DOCX resume to get personalized recommendations, or ask me to search tech listings.";
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

  // 5. Handle Resume Status / Upload Guidance Intent
  if (intent === "resume_upload" || intent === "resume_status") {
    if (profile) {
      const skillsStr =
        profile.skills.length > 0 ? profile.skills.slice(0, 8).join(", ") : "Not specified";
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
        message:
          "You can upload your PDF or DOCX resume by clicking the **Attach Resume** button below or dragging a document into the chat. Once uploaded, I will parse your skills, experience, and projects for real-time job matching.",
        intent: "resume_upload",
        activeFilters,
        provider: llmStatus.provider,
        suggestedFollowUps: ["📄 Attach Resume", "🔍 Search jobs without resume"],
      };
    }
  }

  // 6. Handle Job Search and Refine Search Intents
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
      if (mergedFilters.location) {
        message = `No jobs were found matching your current filter criteria in **${mergedFilters.location}**. Most verified positions in our dataset are located in Europe, the UK, or offered as Remote roles.`;
      } else if (mergedFilters.query) {
        message = `No jobs were found matching "${mergedFilters.query}" in our verified dataset. All 1,600 listings come from verified European tech employers on Arbeitnow.`;
      } else if (mergedFilters.skills?.length) {
        message = `No jobs were found matching your current filter criteria requiring **${mergedFilters.skills.join(" and ")}**. Try searching for related technologies or broader engineering roles.`;
      } else if (mergedFilters.minScore) {
        message = `No jobs were found matching your current filter criteria reaching the **${mergedFilters.minScore}%** compatibility threshold. Try searching without a minimum match constraint.`;
      } else {
        message =
          "No jobs were found matching your current filter criteria. Try broadening your search or removing some skill/location constraints.";
      }
    } else {
      const remoteNote = mergedFilters.remoteOnly ? "remote " : "";
      const skillNote = mergedFilters.skills?.length ? `requiring ${mergedFilters.skills.join(", ")} ` : "";
      const profileNote = profile
        ? `matching your profile`
        : `based on general software engineering roles (upload your resume for personalized match scores)`;

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

  // 7. Handle Apply to Job Intent
  if (intent === "apply_to_job") {
    // A. Ambiguous Reference Resolution
    if (!targetJobRef || targetJobRef.isAmbiguous) {
      if (currentJobs.length === 0) {
        return {
          message:
            "No jobs are currently displayed to apply for. Please ask me to search for jobs first (e.g., 'find matching jobs').",
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
          { jobId: targetJob.id, candidateName: profile?.name, userId },
          customStoragePath,
          customJobsDataset
        );

        return {
          message: result.success
            ? `Your application for **${targetJob.title}** at **${targetJob.company}** has been tracked in CareerPilot AI.\n\n> ℹ️ **Notice**: This records your application within your assistant tracker. To submit credentials directly to the employer, visit: [Official Job Posting](${targetJob.source_url}).`
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
          message:
            "No search results are currently active to resolve job by number. Please search for jobs first.",
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
        provider: llmStatus.provider,
      };
    }

    const result = await recordApplication(
      {
        jobId: targetJobId,
        candidateName: profile?.name,
        userId,
      },
      customStoragePath,
      customJobsDataset
    );

    if (result.alreadyApplied) {
      return {
        message: `⚠️ **Duplicate Notice**: You have already recorded an application for this role!\n\n• **Role**: ${result.record?.jobTitle}\n• **Company**: ${result.record?.company}\n• **Status**: \`${result.record?.status || "tracked"}\`\n\nCareerPilot AI prevents duplicate submissions.`,
        intent,
        profile,
        application: result.record,
        jobs: currentJobs,
        provider: llmStatus.provider,
        actionTaken: "Prevented duplicate application record.",
      };
    }

    if (!result.success) {
      return {
        message: `❌ **Failed to Track Application**: ${result.error}`,
        intent,
        profile,
        jobs: currentJobs,
        provider: llmStatus.provider,
      };
    }

    const app = result.record!;
    const message = `✅ **Application Tracked Successfully!**\n\n• **Role**: ${app.jobTitle}\n• **Company**: ${app.company}\n• **Status**: \`${app.status}\`\n• **Date**: ${new Date(app.applicationDate).toLocaleString()}\n\n> ℹ️ **Transparency Notice**: CareerPilot AI has logged this application in your internal tracker. To complete your official external application, please visit: [${app.company} Job Posting](${app.sourceUrl}).`;

    return {
      message,
      intent,
      profile,
      application: app,
      jobs: currentJobs,
      provider: llmStatus.provider,
      actionTaken: `Tracked application for ${app.jobTitle} at ${app.company}.`,
      suggestedFollowUps: ["📋 View my applied jobs", "🔍 Find more jobs", "🌐 Show remote jobs"],
    };
  }

  // 8. Handle Track Applications Intent
  if (intent === "track_applications") {
    let applications: ApplicationRecord[] = [];
    try {
      applications = await listApplications(customStoragePath, customJobsDataset, userId);
    } catch (err) {
      return {
        message: `❌ Failed to retrieve tracked applications: ${(err as Error).message}`,
        intent,
        profile,
        provider: llmStatus.provider,
      };
    }

    if (applications.length === 0) {
      return {
        message:
          "You haven't tracked any applications yet. When you find a job you like, say **\"apply to job 1\"** or click the **\"Track Application\"** button on any job card.",
        intent,
        profile,
        provider: llmStatus.provider,
        suggestedFollowUps: ["🎯 Find matching jobs", "🌐 Show remote software jobs"],
      };
    }

    const summaryList = applications
      .slice(0, 5)
      .map(
        (a, i) =>
          `${i + 1}. **${a.jobTitle}** at *${a.company}* (\`${a.status}\`, applied ${new Date(a.applicationDate).toLocaleDateString()})`
      )
      .join("\n");

    const message = `You currently have **${applications.length}** tracked application(s):\n\n${summaryList}${applications.length > 5 ? `\n\n*(+ ${applications.length - 5} more in your Applications drawer)*` : ""}\n\nYou can view and update the status of each application in the **Applications** drawer in the top navigation.`;

    return {
      message,
      intent,
      profile,
      applications,
      provider: llmStatus.provider,
      actionTaken: `Retrieved ${applications.length} application records.`,
      suggestedFollowUps: ["🎯 Find more jobs", "🌐 Show remote jobs only"],
    };
  }

  // 9. Handle Help Intent
  if (intent === "help") {
    return {
      message:
        "Here are some things you can ask me to do:\n\n1. **📄 Parse Resumes**: Upload a PDF or DOCX resume to extract skills, experience, and projects.\n2. **🎯 Real Job Matching**: Compare your profile against 1,600 verified listings with explainable 50/30/20 scores.\n3. **🌐 Filter Refinements**: Say *\"show remote only\"*, *\"require React and TypeScript\"*, or *\"jobs requiring Python\"*.\n4. **📋 Track Applications**: Say *\"apply to job 1\"* or *\"show applied jobs\"* with duplicate prevention.\n\nWhat would you like to explore?",
      intent,
      profile,
      provider: llmStatus.provider,
      suggestedFollowUps: ["📄 Upload Resume", "🎯 Find matching jobs", "🌐 Show remote jobs"],
    };
  }

  // 10. Unknown Intent Fallback
  return {
    message:
      "Here are some things you can ask me to do:\n\n• **\"Find jobs matching my resume\"**\n• **\"Show remote jobs\"**\n• **\"Filter by React & TypeScript\"**\n• **\"Show applied jobs\"**",
    intent: "unknown",
    profile,
    provider: llmStatus.provider,
    suggestedFollowUps: [
      "🎯 Find matching jobs",
      "🌐 Show remote software jobs",
      "📄 Upload Resume",
    ],
  };
}

export const runOrchestrator = processAgentMessage;
