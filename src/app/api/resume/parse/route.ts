import { NextRequest, NextResponse } from "next/server";
import { parseResumeFile } from "@/lib/tools/resumeParser";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid content type. Expected multipart/form-data with a resume file.",
        },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        {
          success: false,
          error: "No resume file provided. Please upload a PDF or DOCX file.",
        },
        { status: 400 }
      );
    }

    const filename = file instanceof File ? file.name : "resume.pdf";
    const mimeType = file.type;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Uploaded file is empty (0 bytes).",
        },
        { status: 400 }
      );
    }

    if (buffer.length > 5 * 1024 * 1024) {
      return NextResponse.json(
        {
          success: false,
          error: "File size exceeds the 5 MB limit. Please upload a smaller resume.",
        },
        { status: 413 }
      );
    }

    const result = await parseResumeFile(buffer, filename, mimeType);

    if (!result.success) {
      const isFormatError = result.error?.includes("Unsupported file format");
      const isReadableError = result.error?.includes("unreadable") || result.error?.includes("insufficient");
      const status = isFormatError ? 415 : isReadableError ? 422 : 400;

      return NextResponse.json(
        {
          success: false,
          error: result.error || "Failed to parse resume.",
        },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      profile: result.profile,
      sourceFileName: result.sourceFileName,
      fileSizeBytes: result.fileSizeBytes,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: "An unexpected error occurred while processing the resume file.",
        details: process.env.NODE_ENV === "development" ? (err as Error).message : undefined,
      },
      { status: 500 }
    );
  }
}
