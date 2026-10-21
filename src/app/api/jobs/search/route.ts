import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { matchJobs } from "@/lib/tools/jobMatcher";
import { ParsedProfileSchema, ParsedProfile } from "@/lib/types/resume";

const SearchRequestBodySchema = z.object({
  profile: ParsedProfileSchema.optional(),
  filter: z
    .object({
      query: z.string().optional(),
      remoteOnly: z.boolean().optional(),
      skills: z.array(z.string()).optional(),
      location: z.string().optional(),
      limit: z.number().int().min(1).max(50).optional().default(10),
    })
    .optional(),
});

const defaultGenericProfile: ParsedProfile = {
  name: "Candidate",
  contact: { email: "", phone: "", location: "", linkedin: "", github: "", website: "" },
  designation: "Software Engineer",
  yearsOfExperience: 2,
  skills: ["JavaScript", "TypeScript", "React", "Node.js", "Python"],
  experience: [],
  education: [],
  projects: [],
  summary: "",
  rawTextLength: 0,
};

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => ({}));
    const parseResult = SearchRequestBodySchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid search parameters.",
          details: parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
        { status: 400 }
      );
    }

    const { profile, filter } = parseResult.data;
    const targetProfile = profile || defaultGenericProfile;

    const results = matchJobs(targetProfile, filter);

    return NextResponse.json({
      success: true,
      count: results.length,
      filterApplied: filter || {},
      results,
      message:
        results.length === 0
          ? "No jobs found matching your criteria. Try removing some filters or searching for broader terms."
          : `Found ${results.length} matching jobs ranked by compatibility score.`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to perform job search.",
        details: process.env.NODE_ENV === "development" ? (err as Error).message : undefined,
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get("query") || undefined;
    const remoteOnly = searchParams.get("remote") === "true";
    const location = searchParams.get("location") || undefined;
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "10", 10), 1), 50);

    const skillsParam = searchParams.get("skills");
    const skills = skillsParam ? skillsParam.split(",").map((s) => s.trim()) : undefined;

    const results = matchJobs(defaultGenericProfile, {
      query,
      remoteOnly,
      skills,
      location,
      limit,
    });

    return NextResponse.json({
      success: true,
      count: results.length,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to retrieve job listings.",
        details: process.env.NODE_ENV === "development" ? (err as Error).message : undefined,
      },
      { status: 500 }
    );
  }
}
