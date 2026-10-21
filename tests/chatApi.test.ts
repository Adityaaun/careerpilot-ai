import { describe, it, expect } from "vitest";
import { POST } from "../src/app/api/chat/route";
import { NextRequest } from "next/server";

describe("Chat API Route Contract (/api/chat)", () => {
  it("rejects empty or missing message with HTTP 400", async () => {
    const req = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Invalid chat request format");
  });

  it("rejects messages exceeding length limit with HTTP 400", async () => {
    const longMessage = "a".repeat(1500);
    const req = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: longMessage }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("processes a valid message and returns structured orchestrator response with HTTP 200", async () => {
    const req = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Hello CareerPilot" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.intent).toBe("greeting");
    expect(body.message).toContain("CareerPilot AI");
    expect(body.provider).toBe("deterministic-fallback");
  });
});
