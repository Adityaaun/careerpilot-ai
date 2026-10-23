"use client";

import React, { useState } from "react";
import { Briefcase, MapPin, ExternalLink, Check, Clock, Sparkles } from "lucide-react";
import { JobMatchResult } from "@/lib/types/job";

interface JobCardProps {
  result: JobMatchResult;
  index: number;
  onApply: (jobId: string) => Promise<void> | void;
  isApplied?: boolean;
}

export const JobCard: React.FC<JobCardProps> = ({ result, index, onApply, isApplied = false }) => {
  const { job, matchScore, matchedSkills, matchReason } = result;
  const [applying, setApplying] = useState(false);

  const handleApplyClick = async () => {
    if (isApplied || applying) return;
    setApplying(true);
    try {
      await onApply(job.id);
    } finally {
      setApplying(false);
    }
  };

  const getScoreBadgeColor = (score: number) => {
    if (score >= 80) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    if (score >= 60) return "bg-indigo-500/15 text-indigo-400 border-indigo-500/30";
    return "bg-slate-700/50 text-slate-300 border-slate-600";
  };

  return (
    <div className="group relative rounded-xl border border-slate-800 bg-[#101728] p-4 text-slate-100 shadow-md hover:border-indigo-500/40 transition-all">
      {/* Top row: Title, Company, Index & Score */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-800 text-[11px] font-bold text-slate-300 border border-slate-700">
              #{index + 1}
            </span>
            <h4 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">
              {job.title}
            </h4>
          </div>
          <p className="mt-1 text-xs font-medium text-slate-300 flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            <span>{job.company}</span>
            <span className="text-slate-500">•</span>
            <MapPin className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <span>{job.location}</span>
          </p>
        </div>

        {/* Score Badge */}
        <div
          className={`shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold border ${getScoreBadgeColor(
            matchScore
          )}`}
        >
          <Sparkles className="h-3 w-3" />
          <span>{matchScore}% Match</span>
        </div>
      </div>

      {/* Badges: Remote & Experience */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        {job.remote && (
          <span className="rounded-md bg-cyan-500/10 px-2 py-0.5 font-medium text-cyan-400 border border-cyan-500/20">
            🌐 Remote
          </span>
        )}
        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-slate-300 border border-slate-700/60 flex items-center gap-1">
          <Clock className="h-3 w-3 text-slate-400" />
          {job.experience_required}
        </span>
      </div>

      {/* Matched Skills */}
      {matchedSkills.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold text-indigo-400">MATCHED SKILLS:</span>
          {matchedSkills.slice(0, 8).map((skill, sIdx) => (
            <span
              key={sIdx}
              className="rounded bg-indigo-950/70 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300 border border-indigo-800/40"
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      {/* Role / Job Requirements Tags */}
      {job.skills && job.skills.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold text-slate-500">JOB TAGS:</span>
          {job.skills.slice(0, 8).map((tag, tIdx) => (
            <span
              key={tIdx}
              className="rounded bg-slate-900/60 px-1.5 py-0.5 text-[10px] font-normal text-slate-400 border border-slate-800"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Match Reason */}
      <p className="mt-2.5 text-xs text-slate-400 leading-relaxed border-t border-slate-800/60 pt-2 italic">
        💡 {matchReason}
      </p>

      {/* Action buttons */}
      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-slate-800/80 pt-3">
        <a
          href={job.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          <span>Official Listing</span>
          <ExternalLink className="h-3 w-3" />
        </a>

        <button
          type="button"
          disabled={isApplied || applying}
          onClick={handleApplyClick}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
            isApplied
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default"
              : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 hover:scale-[1.02]"
          }`}
        >
          {isApplied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span>Tracked</span>
            </>
          ) : applying ? (
            <>
              <div className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              <span>Tracking...</span>
            </>
          ) : (
            <>
              <Briefcase className="h-3.5 w-3.5" />
              <span>Track Application</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
