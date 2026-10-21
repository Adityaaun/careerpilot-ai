"use client";

import React, { useState, useRef } from "react";
import { Upload, FileText, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { ParsedProfile } from "@/lib/types/resume";

interface ResumeDropzoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onParsedSuccess: (profile: ParsedProfile, filename: string) => void;
}

export const ResumeDropzoneModal: React.FC<ResumeDropzoneModalProps> = ({
  isOpen,
  onClose,
  onParsedSuccess,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (file: File) => {
    setErrorMsg(null);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "docx") {
      setErrorMsg("Please upload a PDF (.pdf) or Word document (.docx).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg(`File size (${(file.size / 1024 / 1024).toFixed(1)} MB) exceeds the 5 MB limit.`);
      return;
    }
    setSelectedFile(file);
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile || uploading) return;
    setUploading(true);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch("/api/resume/parse", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to extract text from resume.");
      }

      onParsedSuccess(data.profile, data.sourceFileName || selectedFile.name);
      onClose();
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-2xl text-slate-100">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Upload Your Resume</h3>
            <p className="text-xs text-slate-400">PDF or DOCX documents up to 5 MB</p>
          </div>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files?.[0]) {
              handleFileSelect(e.dataTransfer.files[0]);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
            isDragging
              ? "border-indigo-400 bg-indigo-500/10"
              : selectedFile
              ? "border-emerald-500/50 bg-emerald-500/5"
              : "border-slate-700 bg-slate-900/50 hover:border-slate-600 hover:bg-slate-900"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                handleFileSelect(e.target.files[0]);
              }
            }}
          />

          {selectedFile ? (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <p className="text-xs font-semibold text-emerald-300">{selectedFile.name}</p>
              <p className="text-[11px] text-slate-400">
                {(selectedFile.size / 1024).toFixed(0)} KB • Click to choose different file
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-indigo-400" />
              <p className="text-xs font-medium text-slate-300">
                Drag and drop your resume here, or <span className="text-indigo-400 underline">browse</span>
              </p>
              <p className="text-[11px] text-slate-500">Supports PDF and Word (.docx)</p>
            </div>
          )}
        </div>

        {/* Error message display */}
        {errorMsg && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-2.5 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
            <div className="flex-1">
              <p className="font-semibold">Parsing Error</p>
              <p className="text-[11px] text-red-300/90">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!selectedFile || uploading}
            onClick={handleUploadSubmit}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all"
          >
            {uploading ? (
              <>
                <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>Extracting Profile...</span>
              </>
            ) : (
              <span>Parse & Load Profile</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
