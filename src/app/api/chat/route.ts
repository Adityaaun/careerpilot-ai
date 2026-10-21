import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runOrchestrator } from "@/lib/agent/orchestrator";
import { ParsedProfileSchema } from "@/lib/types/resume";

const ChatRequestBodySchema = z.object({
  message: z.string().min(1, "Message cannot be empty").max(1000, "Message is too long"),
  profile: ParsedProfileSchema.optional(),
  currentJobs: z.array(z.any()).optional().default([]),
  activeFilters: z
    .object({
      query: z.string().optional(),
      remoteOnly: z.boolean().optional(),
      skills: z.array(z.string()).optional(),
      location: z.string().optional(),
      limit: z.number().optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => ({}));
    const parseResult = ChatRequestBodySchema.safeParse(raw);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid chat request format.",
          details: parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
        { status: 400 }
      );
    }

    const { message, profile, currentJobs, activeFilters } = parseResult.data;

    const output = await runOrchestrator({
      userMessage: message,
      profile,
      currentJobs,
      activeFilters,
    });

    return NextResponse.json({
      success: true,
      ...output,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process conversational request.",
        details: process.env.NODE_ENV === "development" ? (err as Error).message : undefined,
      },
      { status: 500 }
    );
  }
}
