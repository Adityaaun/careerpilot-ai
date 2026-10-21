import { ParsedProfile } from "./resume";
import { JobMatchResult } from "./job";
import { ApplicationRecord } from "./application";

export type MessageRole = "user" | "assistant" | "system";

export type MessageType =
  | "text"
  | "resume_uploaded"
  | "profile_summary"
  | "job_recommendations"
  | "application_confirmation"
  | "applications_list"
  | "error";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  type?: MessageType;
  timestamp: string;
  metadata?: {
    profile?: ParsedProfile;
    jobs?: JobMatchResult[];
    application?: ApplicationRecord;
    applications?: ApplicationRecord[];
    toolCalled?: string;
    suggestedFollowUps?: string[];
    isFallback?: boolean;
    errorDetails?: string;
  };
}

export type AgentToolName =
  | "parse_resume"
  | "match_jobs"
  | "apply_to_job"
  | "track_applications"
  | "clarify_intent";

export interface AgentAction {
  tool: AgentToolName;
  params: Record<string, unknown>;
}
