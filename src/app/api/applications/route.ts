import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordApplication, listApplications } from "@/lib/tools/applicationStore";

const RecordApplicationBodySchema = z.object({
  jobId: z.string().min(1, "Job ID is required"),
  notes: z.string().optional(),
  candidateName: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => ({}));
    const parseResult = RecordApplicationBodySchema.safeParse(raw);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid application request payload.",
          details: parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
        { status: 400 }
      );
    }

    const { jobId, notes, candidateName } = parseResult.data;
    const result = await recordApplication({ jobId, notes, candidateName });

    if (result.alreadyApplied) {
      return NextResponse.json(
        {
          success: false,
          alreadyApplied: true,
          record: result.record,
          message: result.error,
          externalNotice: result.externalNotice,
        },
        { status: 409 }
      );
    }

    if (!result.success) {
      const isNotFound = result.error?.includes("not found");
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Failed to record application.",
          externalNotice: result.externalNotice,
        },
        { status: isNotFound ? 404 : 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        record: result.record,
        externalNotice: result.externalNotice,
        message: `Application for "${result.record?.jobTitle}" tracked successfully.`,
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: "An unexpected error occurred while recording the application.",
        details: process.env.NODE_ENV === "development" ? (err as Error).message : undefined,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const applications = listApplications();

    return NextResponse.json({
      success: true,
      count: applications.length,
      applications,
      message:
        applications.length === 0
          ? "No applications recorded yet. Search for matching jobs and apply to track them here."
          : `Retrieved ${applications.length} recorded application(s).`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to retrieve application history.",
        details: process.env.NODE_ENV === "development" ? (err as Error).message : undefined,
      },
      { status: 500 }
    );
  }
}
