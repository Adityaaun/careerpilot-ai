"use client";

import React from "react";
import { Mail, Phone, Briefcase, GraduationCap, Code2, Sparkles, ExternalLink } from "lucide-react";
import { ParsedProfile } from "@/lib/types/resume";

interface ProfileSummaryCardProps {
  profile: ParsedProfile;
  onSearchJobs?: () => void;
}

export const ProfileSummaryCard: React.FC<ProfileSummaryCardProps> = ({ profile, onSearchJobs }) => {
  return (
    <div className="mt-3 rounded-xl border border-indigo-500/20 bg-slate-900/80 p-4 shadow-xl backdrop-blur-sm text-slate-200">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-500 text-white font-bold text-sm shadow-md">
            {profile.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              {profile.name}
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                Parsed Profile
              </span>
            </h3>
            <p className="text-xs text-indigo-300 font-medium">{profile.designation}</p>
          </div>
        </div>

        {onSearchJobs && (
          <button
            type="button"
            onClick={onSearchJobs}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 transition-all hover:scale-[1.02]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Find Matching Jobs</span>
          </button>
        )}
      </div>

      {/* Contact Bar */}
      <div className="flex flex-wrap items-center gap-3 py-2.5 text-xs text-slate-400 border-b border-slate-800/60">
        {profile.contact.email && (
          <span className="flex items-center gap-1.5 text-slate-300">
            <Mail className="h-3.5 w-3.5 text-indigo-400" />
            {profile.contact.email}
          </span>
        )}
        {profile.contact.phone && (
          <span className="flex items-center gap-1.5 text-slate-300">
            <Phone className="h-3.5 w-3.5 text-cyan-400" />
            {profile.contact.phone}
          </span>
        )}
        {profile.contact.linkedin && (
          <a
            href={profile.contact.linkedin.startsWith("http") ? profile.contact.linkedin : `https://${profile.contact.linkedin}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-indigo-400 hover:underline"
          >
            <span>LinkedIn</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {profile.contact.github && (
          <a
            href={profile.contact.github.startsWith("http") ? profile.contact.github : `https://${profile.contact.github}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-cyan-400 hover:underline"
          >
            <span>GitHub</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Skills Chips */}
      <div className="py-2.5">
        <p className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 mb-2">
          <Code2 className="h-3.5 w-3.5 text-indigo-400" />
          EXTRACTED SKILLS ({profile.skills.length})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {profile.skills.map((skill, idx) => (
            <span
              key={idx}
              className="rounded-md bg-slate-800/90 px-2 py-0.5 text-[11px] font-medium text-slate-200 border border-slate-700/60"
            >
              {skill}
            </span>
          ))}
        </div>
      </div>

      {/* Experience & Education Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/60 text-xs">
        <div>
          <p className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 mb-1.5">
            <Briefcase className="h-3.5 w-3.5 text-indigo-400" />
            EXPERIENCE ({profile.yearsOfExperience} yrs)
          </p>
          {profile.experience.length > 0 ? (
            profile.experience.slice(0, 2).map((exp, idx) => (
              <div key={idx} className="mb-1 text-slate-300">
                <span className="font-medium text-white">{exp.role || "Role"}</span>
                <span className="text-slate-400"> @ {exp.company || "Company"}</span>
              </div>
            ))
          ) : (
            <p className="text-slate-500 italic">No specific past roles parsed</p>
          )}
        </div>

        <div>
          <p className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 mb-1.5">
            <GraduationCap className="h-3.5 w-3.5 text-cyan-400" />
            EDUCATION
          </p>
          {profile.education.length > 0 ? (
            profile.education.slice(0, 1).map((edu, idx) => (
              <div key={idx} className="text-slate-300">
                <span className="font-medium text-white">{edu.degree || "Degree"}</span>
                <p className="text-slate-400">{edu.institution || "Institution"}</p>
              </div>
            ))
          ) : (
            <p className="text-slate-500 italic">No education section parsed</p>
          )}
        </div>
      </div>
    </div>
  );
};
