import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  recordApplication,
  listApplications,
  updateApplicationStatus,
  getStorageStatus,
} from "@/lib/tools/applicationStore";
import { ApplicationStatusSchema } from "@/lib/types/application";

const RecordApplicationBodySchema = z.object({
  jobId: z.string().min(1, "Job ID is required"),
  notes: z.string().optional(),
  candidateName: z.string().optional(),
});

const UpdateApplicationBodySchema = z.object({
  id: z.string().min(1, "Application ID is required"),
  status: ApplicationStatusSchema,
  notes: z.string().optional(),
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
    const storage = getStorageStatus();

    if (result.alreadyApplied) {
      return NextResponse.json(
        {
          success: false,
          alreadyApplied: true,
          record: result.record,
          message: result.error,
          externalNotice: result.externalNotice,
          storage,
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
          storage,
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
        storage,
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
    const applications = await listApplications();
    const storage = getStorageStatus();

    return NextResponse.json({
      success: true,
      count: applications.length,
      applications,
      storage,
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

export async function PATCH(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => ({}));
    const parseResult = UpdateApplicationBodySchema.safeParse(raw);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid update request payload.",
          details: parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
        { status: 400 }
      );
    }

    const { id, status, notes } = parseResult.data;
    const updated = await updateApplicationStatus(id, status, notes);

    if (!updated) {
      return NextResponse.json(
        {
          success: false,
          error: `Application with ID "${id}" was not found.`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      record: updated,
      message: `Status updated to "${status}".`,
      storage: getStorageStatus(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update application status.",
        details: process.env.NODE_ENV === "development" ? (err as Error).message : undefined,
      },
      { status: 500 }
    );
  }
}
