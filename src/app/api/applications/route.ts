import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  recordApplication,
  listApplications,
  updateApplicationStatus,
  checkStorageHealth,
} from "@/lib/tools/applicationStore";
import { ApplicationStatusSchema } from "@/lib/types/application";

const RecordApplicationBodySchema = z.object({
  jobId: z.string().min(1, "Job ID is required"),
  notes: z.string().optional(),
  candidateName: z.string().optional(),
  userId: z.string().optional(),
});

const UpdateApplicationBodySchema = z.object({
  id: z.string().min(1, "Application ID is required"),
  status: ApplicationStatusSchema,
  notes: z.string().optional(),
  userId: z.string().optional(),
});

function getUserIdFromRequest(req: NextRequest, bodyUserId?: string): string {
  const headerUser = req.headers.get("x-user-id");
  if (headerUser && headerUser.trim().length > 0) {
    return headerUser.trim();
  }
  if (bodyUserId && bodyUserId.trim().length > 0) {
    return bodyUserId.trim();
  }
  return "demo_user";
}

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

    const { jobId, notes, candidateName, userId: bodyUser } = parseResult.data;
    const userId = getUserIdFromRequest(req, bodyUser);

    const result = await recordApplication({ jobId, notes, candidateName, userId });
    const storage = await checkStorageHealth();

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
      const isDbError = result.error?.includes("Database unavailable");
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Failed to record application.",
          externalNotice: result.externalNotice,
          storage,
        },
        { status: isNotFound ? 404 : isDbError ? 503 : 400 }
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
    const message = (err as Error).message || "An unexpected error occurred while recording the application.";
    return NextResponse.json(
      {
        success: false,
        error: message,
        details: process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    const applications = await listApplications(undefined, undefined, userId);
    const storage = await checkStorageHealth();

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
    const message = (err as Error).message || "Failed to retrieve application history.";
    const storage = await checkStorageHealth();
    return NextResponse.json(
      {
        success: false,
        error: message,
        storage,
        details: process.env.NODE_ENV === "development" ? message : undefined,
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

    const { id, status, notes, userId: bodyUser } = parseResult.data;
    const userId = getUserIdFromRequest(req, bodyUser);

    const updated = await updateApplicationStatus(id, status, notes, undefined, userId);
    const storage = await checkStorageHealth();

    if (!updated) {
      return NextResponse.json(
        {
          success: false,
          error: `Application with ID "${id}" was not found.`,
          storage,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      record: updated,
      message: `Status updated to "${status}".`,
      storage,
    });
  } catch (err) {
    const message = (err as Error).message || "Failed to update application status.";
    return NextResponse.json(
      {
        success: false,
        error: message,
        details: process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status: 500 }
    );
  }
}
