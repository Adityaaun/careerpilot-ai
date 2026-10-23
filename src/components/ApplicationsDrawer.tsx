"use client";

import React, { useState, useEffect } from "react";
import { Briefcase, X, ExternalLink, Calendar, CheckCircle2, ChevronDown, RefreshCw } from "lucide-react";
import { ApplicationRecord, ApplicationStatus } from "@/lib/types/application";

interface ApplicationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  applications: ApplicationRecord[];
  onFindJobs?: () => void;
  onStatusChange?: (id: string, newStatus: ApplicationStatus) => Promise<void>;
  onRefresh?: () => Promise<void>;
  isRefreshing?: boolean;
}

const STATUS_OPTIONS: Array<{ value: ApplicationStatus; label: string; color: string }> = [
  { value: "tracked", label: "Tracked", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  { value: "submitted", label: "Submitted", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  { value: "interviewing", label: "Interviewing", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  { value: "offered", label: "Offered", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  { value: "rejected", label: "Archived", color: "text-slate-400 bg-slate-500/10 border-slate-500/20" },
];

/**
 * Dismisses the applications drawer when the Escape key is pressed.
 * Returns true if Escape was intercepted and onClose was invoked.
 */
export function handleDrawerKeyDown(
  event: { key: string; stopPropagation: () => void },
  onClose: () => void
): boolean {
  if (event.key === "Escape") {
    event.stopPropagation();
    onClose();
    return true;
  }
  return false;
}

export const ApplicationsDrawer: React.FC<ApplicationsDrawerProps> = ({
  isOpen,
  onClose,
  applications,
  onFindJobs,
  onStatusChange,
  onRefresh,
  isRefreshing,
}) => {
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Close drawer on Escape key press, cleaning up the listener properly
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      handleDrawerKeyDown(event, onClose);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectStatus = async (appId: string, status: ApplicationStatus) => {
    if (!onStatusChange || updatingId) return;
    setUpdatingId(appId);
    try {
      await onStatusChange(appId, status);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tracked Applications"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative h-full w-full max-w-md bg-[#0f172a] border-l border-slate-800 p-6 flex flex-col text-slate-100 shadow-2xl"
      >
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

          <div className="flex items-center gap-1.5">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                title="Refresh application records"
                disabled={isRefreshing}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin text-indigo-400" : ""}`} />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              title="Close drawer"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
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
            applications.map((app) => {
              const currentStatusConfig =
                STATUS_OPTIONS.find((s) => s.value === app.status) || STATUS_OPTIONS[0];

              return (
                <div
                  key={app.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-slate-700 transition-all text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-slate-100 text-sm leading-snug">{app.jobTitle}</h4>

                    {/* Interactive Status Selector */}
                    {onStatusChange ? (
                      <div className="relative inline-block shrink-0">
                        <select
                          value={app.status}
                          disabled={updatingId === app.id}
                          onChange={(e) => handleSelectStatus(app.id, e.target.value as ApplicationStatus)}
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border cursor-pointer outline-none transition-colors appearance-none pr-5 ${currentStatusConfig.color} disabled:opacity-50`}
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-slate-400" />
                      </div>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${currentStatusConfig.color}`}>
                        {app.status}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-xs text-slate-400 font-medium">{app.company} • {app.location}</p>

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
              );
            })
          )}
        </div>

        {/* Footer Notice */}
        <div className="border-t border-slate-800 pt-3 text-[11px] text-slate-500 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>Authoritative records stored in persistent database. Official submissions are completed on employer portals.</span>
        </div>
      </div>
    </div>
  );
};
