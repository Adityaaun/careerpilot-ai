"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Upload,
  Send,
  Briefcase,
  FileText,
  Search,
  Bot,
  User,
  Layers,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { ParsedProfile } from "@/lib/types/resume";
import { JobMatchResult, JobFilterCriteria } from "@/lib/types/job";
import { ApplicationRecord } from "@/lib/types/application";
import { ProfileSummaryCard } from "@/components/ProfileSummaryCard";
import { JobCard } from "@/components/JobCard";
import { ResumeDropzoneModal } from "@/components/ResumeDropzoneModal";
import { ApplicationsDrawer } from "@/components/ApplicationsDrawer";

interface ChatItem {
  id: string;
  sender: "assistant" | "user";
  text: string;
  time: string;
  profile?: ParsedProfile;
  jobs?: JobMatchResult[];
  application?: ApplicationRecord;
  applications?: ApplicationRecord[];
  isWelcome?: boolean;
}

export default function Home() {
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      id: "welcome",
      sender: "assistant",
      text: "Hello! I am **CareerPilot AI**, your autonomous job-matching and career agent. Upload your PDF or DOCX resume to get personalized recommendations, or ask me to search real software engineering jobs.",
      time: "Just now",
      isWelcome: true,
    },
  ]);

  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeProfile, setActiveProfile] = useState<ParsedProfile | null>(null);
  const [currentJobs, setCurrentJobs] = useState<JobMatchResult[]>([]);
  const [activeFilters, setActiveFilters] = useState<JobFilterCriteria>({});
  const [trackedApplications, setTrackedApplications] = useState<ApplicationRecord[]>([]);

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSubmitting]);

  // Load existing application records on mount
  useEffect(() => {
    fetch("/api/applications")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.applications)) {
          setTrackedApplications(data.applications);
        }
      })
      .catch(() => {});
  }, []);

  const suggestedPrompts = [
    { label: "📄 Upload Resume", action: () => setIsUploadOpen(true) },
    { label: "🎯 Match My Resume", prompt: "Find jobs matching my resume." },
    { label: "🌐 Remote Jobs Only", prompt: "Show only remote software engineer jobs." },
    { label: "⚛️ React & TypeScript", prompt: "Show jobs requiring React and TypeScript." },
    { label: "📋 My Applied Jobs", prompt: "Show my previously applied jobs." },
  ];

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isSubmitting) return;

    const userMsg: ChatItem = {
      id: `usr_${Date.now()}`,
      sender: "user",
      text,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          profile: activeProfile || undefined,
          currentJobs: currentJobs.length > 0 ? currentJobs : undefined,
          activeFilters: Object.keys(activeFilters).length > 0 ? activeFilters : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to communicate with CareerPilot agent.");
      }

      // Update state
      if (data.profile) {
        setActiveProfile(data.profile);
      }
      if (data.jobs) {
        setCurrentJobs(data.jobs);
      }
      if (data.activeFilters) {
        setActiveFilters(data.activeFilters);
      }
      if (data.application) {
        // Refresh application tracking
        setTrackedApplications((prev) => {
          const exists = prev.some((a) => a.id === data.application.id || a.jobId === data.application.jobId);
          return exists ? prev : [data.application, ...prev];
        });
      }
      if (data.applications) {
        setTrackedApplications(data.applications);
      }

      const botMsg: ChatItem = {
        id: `bot_${Date.now()}`,
        sender: "assistant",
        text: data.message || "Operation completed.",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        profile: data.profile && data.intent === "resume_status" ? data.profile : undefined,
        jobs: data.jobs && data.jobs.length > 0 ? data.jobs : undefined,
        application: data.application,
        applications: data.applications,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: "assistant",
          text: `⚠️ **Agent Error**: ${(err as Error).message}`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResumeParsed = (profile: ParsedProfile, filename: string) => {
    setActiveProfile(profile);

    // Add user upload notice & assistant profile card to chat stream
    const userNotice: ChatItem = {
      id: `usr_upload_${Date.now()}`,
      sender: "user",
      text: `Uploaded resume: ${filename}`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const assistantNotice: ChatItem = {
      id: `bot_upload_${Date.now()}`,
      sender: "assistant",
      text: `Successfully parsed **${profile.name}'s** resume! I extracted **${profile.skills.length} skills**, **${profile.yearsOfExperience} year(s) of experience**, and past history. Review your profile below or ask me to match jobs:`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      profile,
    };

    setMessages((prev) => [...prev, userNotice, assistantNotice]);
  };

  const handleApplyToJob = async (jobId: string) => {
    await handleSend(`Apply to job ${jobId}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-[#0b0f19] text-slate-100 overflow-hidden font-sans">
      {/* Header */}
      <header className="flex h-16 w-full items-center justify-between border-b border-slate-800/80 bg-[#0f172a]/80 px-6 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 shadow-lg shadow-indigo-500/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight text-white">CareerPilot AI</h1>
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-400 border border-indigo-500/20">
                Hidani Tech Assessment
              </span>
            </div>
            <p className="text-xs text-slate-400">Autonomous Job Matching & Resume Intelligence</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Active Profile Pill */}
          {activeProfile && (
            <div className="hidden md:flex items-center gap-2 rounded-lg bg-indigo-950/60 border border-indigo-800/50 px-3 py-1.5 text-xs text-indigo-200">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>
                <strong>{activeProfile.name}</strong> ({activeProfile.designation})
              </span>
            </div>
          )}

          {/* Dataset Status */}
          <div className="hidden sm:flex items-center gap-2 rounded-lg bg-slate-900/80 px-3 py-1.5 border border-slate-800 text-xs text-slate-300">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>
              Dataset: <strong>1,600 verified</strong> jobs
            </span>
          </div>

          {/* Upload Button in Header */}
          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/60 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors"
          >
            <Upload className="h-3.5 w-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Upload Resume</span>
          </button>

          {/* Tracked Applications Drawer Trigger */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 transition-all hover:scale-[1.02]"
          >
            <Briefcase className="h-3.5 w-3.5" />
            <span>Applications ({trackedApplications.length})</span>
          </button>
        </div>
      </header>

      {/* Main Chat Thread */}
      <main className="flex flex-1 flex-col overflow-hidden max-w-5xl w-full mx-auto p-4 sm:p-6">
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 sm:pr-2">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 animate-fade-in ${
                msg.sender === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  msg.sender === "user"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-slate-800 border border-slate-700 text-cyan-400"
                }`}
              >
                {msg.sender === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>

              <div
                className={`max-w-[92%] sm:max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm ${
                  msg.sender === "user"
                    ? "bg-indigo-600 text-white rounded-tr-none"
                    : "bg-[#131b2e] border border-slate-800/90 text-slate-200 rounded-tl-none"
                }`}
              >
                {/* Formatted Text */}
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {msg.text.split("\n").map((line, idx) => (
                    <p key={idx} className="my-0.5">
                      {line}
                    </p>
                  ))}
                </div>

                {/* Inline Profile Card */}
                {msg.profile && (
                  <ProfileSummaryCard
                    profile={msg.profile}
                    onSearchJobs={() => handleSend("Find jobs matching my resume.")}
                  />
                )}

                {/* Inline Job Recommendations */}
                {msg.jobs && msg.jobs.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Recommended Matches ({msg.jobs.length})
                    </p>
                    <div className="grid grid-cols-1 gap-3">
                      {msg.jobs.map((jobResult, idx) => {
                        const isAlreadyApplied = trackedApplications.some(
                          (a) => a.jobId === jobResult.job.id
                        );
                        return (
                          <JobCard
                            key={jobResult.job.id}
                            result={jobResult}
                            index={idx}
                            isApplied={isAlreadyApplied}
                            onApply={handleApplyToJob}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Welcome Helper Grid */}
                {msg.isWelcome && (
                  <div className="mt-4 pt-3 border-t border-slate-800/80">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => setIsUploadOpen(true)}
                        className="flex items-start gap-2.5 rounded-lg bg-slate-900/60 hover:bg-slate-800/80 p-3 border border-slate-800/80 text-left transition-all"
                      >
                        <FileText className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-slate-100">1. Resume Parser</p>
                          <p className="text-[11px] text-slate-400">
                            Drop PDF/DOCX to extract skills, experience & contact details.
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSend("Find jobs matching my resume.")}
                        className="flex items-start gap-2.5 rounded-lg bg-slate-900/60 hover:bg-slate-800/80 p-3 border border-slate-800/80 text-left transition-all"
                      >
                        <Search className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-slate-100">2. Real Job Matcher</p>
                          <p className="text-[11px] text-slate-400">
                            Rank 1,600 real tech jobs with transparent 50/30/20 match scoring.
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSend("Show only remote jobs.")}
                        className="flex items-start gap-2.5 rounded-lg bg-slate-900/60 hover:bg-slate-800/80 p-3 border border-slate-800/80 text-left transition-all"
                      >
                        <Layers className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-slate-100">3. Conversational Refinement</p>
                          <p className="text-[11px] text-slate-400">
                            Say &quot;show remote only&quot; or &quot;require React & TypeScript&quot;.
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsDrawerOpen(true)}
                        className="flex items-start gap-2.5 rounded-lg bg-slate-900/60 hover:bg-slate-800/80 p-3 border border-slate-800/80 text-left transition-all"
                      >
                        <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-slate-100">4. Application Tracker</p>
                          <p className="text-[11px] text-slate-400">
                            Track applications, prevent duplicates, and view status history.
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                <div
                  className={`mt-2 text-[10px] ${
                    msg.sender === "user" ? "text-indigo-200" : "text-slate-400"
                  }`}
                >
                  {msg.time}
                </div>
              </div>
            </div>
          ))}

          {/* Thinking / Loading Indicator */}
          {isSubmitting && (
            <div className="flex items-center gap-3 animate-fade-in">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-cyan-400">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl rounded-tl-none bg-[#131b2e] border border-slate-800 px-4 py-3 text-xs text-slate-400 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-indigo-400 animate-ping" />
                <span>CareerPilot is processing your request...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-slate-800/60 shrink-0">
          {suggestedPrompts.map((item, i) => (
            <button
              key={i}
              type="button"
              className="flex items-center gap-1.5 rounded-full bg-slate-900/90 hover:bg-slate-800 px-3 py-1.5 text-xs text-slate-300 border border-slate-800 transition-all hover:border-indigo-500/40 hover:text-white"
              onClick={() => {
                if (item.action) item.action();
                else if (item.prompt) handleSend(item.prompt);
              }}
            >
              <span>{item.label}</span>
              <ChevronRight className="h-3 w-3 text-slate-400" />
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="mt-3 relative flex items-center gap-2 rounded-2xl bg-[#0f172a] border border-slate-800 p-2 shadow-2xl focus-within:border-indigo-500/60 focus-within:ring-1 focus-within:ring-indigo-500/40 transition-all shrink-0">
          <button
            type="button"
            title="Upload Resume (PDF or DOCX)"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            onClick={() => setIsUploadOpen(true)}
          >
            <Upload className="h-4 w-4 text-indigo-400" />
          </button>

          <input
            type="text"
            className="flex-1 bg-transparent px-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
            placeholder={
              activeProfile
                ? `Ask CareerPilot (e.g. "show remote jobs", "apply to job 1", "require TypeScript")...`
                : `Upload your resume or ask to search jobs (e.g. "show remote React jobs")...`
            }
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          <button
            type="button"
            title="Send Message"
            disabled={!inputValue.trim() || isSubmitting}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all shadow-md shadow-indigo-600/30"
            onClick={() => handleSend()}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </main>

      {/* Resume Upload Modal */}
      <ResumeDropzoneModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onParsedSuccess={handleResumeParsed}
      />

      {/* Tracked Applications Drawer */}
      <ApplicationsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        applications={trackedApplications}
        onFindJobs={() => handleSend("Find jobs matching my resume.")}
      />
    </div>
  );
}
