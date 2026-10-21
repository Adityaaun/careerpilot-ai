"use client";

import React from "react";
import { Briefcase, X, ExternalLink, Calendar, CheckCircle2 } from "lucide-react";
import { ApplicationRecord } from "@/lib/types/application";

interface ApplicationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  applications: ApplicationRecord[];
  onFindJobs?: () => void;
}

export const ApplicationsDrawer: React.FC<ApplicationsDrawerProps> = ({
  isOpen,
  onClose,
  applications,
  onFindJobs,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative h-full w-full max-w-md bg-[#0f172a] border-l border-slate-800 p-6 flex flex-col text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Briefcase className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Tracked Applications</h3>
              <p className="text-xs text-slate-400">
                {applications.length} recorded application{applications.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {applications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800/80 text-slate-500 mb-3 border border-slate-700">
                <Briefcase className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-medium text-slate-300">No Applications Tracked Yet</h4>
              <p className="mt-1 text-xs text-slate-500 max-w-xs">
                When you search for jobs, click &quot;Track Application&quot; or say &quot;apply to job 1&quot; to keep your application history organized here.
              </p>
              {onFindJobs && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onFindJobs();
                  }}
                  className="mt-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition-all"
                >
                  Find Matching Jobs
                </button>
              )}
            </div>
          ) : (
            applications.map((app) => (
              <div
                key={app.id}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-slate-700 transition-all text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-semibold text-slate-100 text-sm">{app.jobTitle}</h4>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                    {app.status}
                  </span>
                </div>

                <p className="mt-1 text-xs text-slate-400 font-medium">{app.company}</p>

                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/60 pt-2.5">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3 text-indigo-400" />
                    {new Date(app.applicationDate).toLocaleDateString()}
                  </span>

                  <a
                    href={app.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-indigo-400 hover:underline"
                  >
                    <span>View Listing</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Notice */}
        <div className="border-t border-slate-800 pt-3 text-[11px] text-slate-500 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>Recorded in CareerPilot AI tracker. Official submissions are completed on employer portals.</span>
        </div>
      </div>
    </div>
  );
};
