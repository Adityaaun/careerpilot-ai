"use client";

import React, { useState } from "react";
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
} from "lucide-react";

interface Message {
  id: string;
  sender: "assistant" | "user";
  text: string;
  time: string;
  type?: "welcome" | "text" | "jobs" | "profile";
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "assistant",
      text: "Hello! I am **CareerPilot AI**, your autonomous career and job-matching assistant. Upload your PDF or DOCX resume to get started, or ask me to search real tech jobs.",
      time: "Just now",
      type: "welcome",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const suggestedPrompts = [
    { label: "📄 Upload Resume", prompt: "I'd like to upload my resume." },
    { label: "🌐 Show remote software jobs", prompt: "Show only remote software engineer jobs." },
    { label: "⚛️ React & Next.js roles", prompt: "Show jobs requiring React or Next.js." },
    { label: "📋 View applied jobs", prompt: "Show my previously applied jobs." },
  ];

  const handleSend = (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isSubmitting) return;

    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      sender: "user",
      text,
      time: "Just now",
      type: "text",
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsSubmitting(true);

    // Initial shell simulated response for Phase 1 preview
    setTimeout(() => {
      let reply = "";
      if (text.toLowerCase().includes("upload") || text.toLowerCase().includes("resume")) {
        reply = "You can upload your PDF or DOCX resume by clicking the **Attach Resume** button below or dropping a file into the chat.";
      } else if (text.toLowerCase().includes("applied") || text.toLowerCase().includes("application")) {
        reply = "You currently have 0 tracked applications. Once you apply to matched jobs, your records will be displayed here.";
      } else {
        reply = `I received your request: "${text}". Full agent tool orchestration (Resume Parsing, Explainable Job Matcher, and Application Tracker) will be connected in Phase 2 & 3.`;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `bot_${Date.now()}`,
          sender: "assistant",
          text: reply,
          time: "Just now",
          type: "text",
        },
      ]);
      setIsSubmitting(false);
    }, 600);
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
      <header className="flex h-16 w-full items-center justify-between border-b border-slate-800/80 bg-[#0f172a]/70 px-6 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 shadow-lg shadow-indigo-500/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight text-white">
                CareerPilot AI
              </h1>
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-400 border border-indigo-500/20">
                SDE Intern Assessment
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Autonomous Job Matching & Resume Intelligence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 rounded-lg bg-slate-900/80 px-3 py-1.5 border border-slate-800 text-xs text-slate-300">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Dataset: <strong>50 verified</strong> / 1,600+ target</span>
          </div>

          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors"
            onClick={() => handleSend("Show my previously applied jobs.")}
          >
            <Briefcase className="h-3.5 w-3.5 text-indigo-400" />
            <span>My Applications</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex flex-1 flex-col overflow-hidden max-w-5xl w-full mx-auto p-4 sm:p-6">
        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
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
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-800 border border-slate-700 text-cyan-400"
                }`}
              >
                {msg.sender === "user" ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>

              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm ${
                  msg.sender === "user"
                    ? "bg-indigo-600 text-white rounded-tr-none"
                    : "bg-[#131b2e] border border-slate-800 text-slate-200 rounded-tl-none"
                }`}
              >
                <div className="prose prose-invert text-sm max-w-none">
                  {msg.text.split("\n").map((line, idx) => (
                    <p key={idx} className="my-1">
                      {line}
                    </p>
                  ))}
                </div>

                {msg.type === "welcome" && (
                  <div className="mt-4 pt-3 border-t border-slate-800/80">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <div className="flex items-start gap-2.5 rounded-lg bg-slate-900/60 p-3 border border-slate-800/80">
                        <FileText className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-slate-100">
                            Resume Parser Tool
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Extracts contact, skills, experience, education & projects from PDF/DOCX.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5 rounded-lg bg-slate-900/60 p-3 border border-slate-800/80">
                        <Search className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-slate-100">
                            Explainable Job Matcher
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Ranks real jobs with transparent match breakdown and live source links.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5 rounded-lg bg-slate-900/60 p-3 border border-slate-800/80">
                        <Layers className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-slate-100">
                            Conversational Refinement
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Filter by remote, tech stack, or experience level seamlessly.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5 rounded-lg bg-slate-900/60 p-3 border border-slate-800/80">
                        <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-slate-100">
                            Application Tracker
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Saves application records, prevents duplicates & handles status.
                          </p>
                        </div>
                      </div>
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

          {isSubmitting && (
            <div className="flex items-center gap-3 animate-fade-in">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-cyan-400">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl rounded-tl-none bg-[#131b2e] border border-slate-800 px-4 py-3 text-xs text-slate-400 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-indigo-400 animate-ping" />
                <span>CareerPilot is thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Suggested Prompt Chips */}
        <div className="mt-4 flex flex-wrap gap-2 pt-2 border-t border-slate-800/50">
          {suggestedPrompts.map((p, i) => (
            <button
              key={i}
              type="button"
              className="flex items-center gap-1.5 rounded-full bg-slate-900/90 hover:bg-slate-800 px-3 py-1.5 text-xs text-slate-300 border border-slate-800 transition-all hover:border-indigo-500/40 hover:text-white"
              onClick={() => handleSend(p.prompt)}
            >
              <span>{p.label}</span>
              <ChevronRight className="h-3 w-3 text-slate-400" />
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="mt-3 relative flex items-center gap-2 rounded-2xl bg-[#0f172a] border border-slate-800 p-2 shadow-2xl focus-within:border-indigo-500/60 focus-within:ring-1 focus-within:ring-indigo-500/40 transition-all">
          <button
            type="button"
            title="Upload Resume (PDF or DOCX)"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            onClick={() => handleSend("I want to upload my resume.")}
          >
            <Upload className="h-4 w-4" />
          </button>

          <input
            type="text"
            className="flex-1 bg-transparent px-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
            placeholder="Type your message or ask to filter jobs (e.g. 'show only remote jobs')..."
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
    </div>
  );
}
