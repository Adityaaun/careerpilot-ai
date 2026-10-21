import { describe, it, expect } from "vitest";
import {
  extractTextFromBuffer,
  parseResumeTextHeuristic,
  parseResumeFile,
} from "../src/lib/tools/resumeParser";
import { createTestPdfBuffer, createTestDocxBuffer } from "./helpers/testDocuments";

describe("Resume Parser Tool", () => {
  describe("Text Extraction", () => {
    it("extracts text from a valid PDF document", async () => {
      const pdfBuffer = createTestPdfBuffer();
      const { text, cleanFilename } = await extractTextFromBuffer(pdfBuffer, "my_resume.pdf");
      expect(cleanFilename).toBe("my_resume.pdf");
      expect(text.length).toBeGreaterThan(20);
      expect(text).toContain("Alex Smith");
    });

    it("extracts text from a valid DOCX document", async () => {
      const docxBuffer = await createTestDocxBuffer();
      const { text, cleanFilename } = await extractTextFromBuffer(docxBuffer, "resume.docx");
      expect(cleanFilename).toBe("resume.docx");
      expect(text.length).toBeGreaterThan(20);
      expect(text).toContain("Sarah Jenkins");
      expect(text).toContain("FastAPI");
    });

    it("rejects unsupported file formats (.txt, .exe, .png)", async () => {
      const txtBuffer = Buffer.from("Hello world text file content that is plain text.");
      await expect(
        extractTextFromBuffer(txtBuffer, "resume.txt", "text/plain")
      ).rejects.toThrow(/Unsupported file format/);
    });

    it("rejects empty files (0 bytes)", async () => {
      const emptyBuffer = Buffer.alloc(0);
      await expect(
        extractTextFromBuffer(emptyBuffer, "resume.pdf", "application/pdf")
      ).rejects.toThrow(/empty/);
    });

    it("rejects oversized files (> 5 MB)", async () => {
      const bigBuffer = Buffer.alloc(6 * 1024 * 1024); // 6 MB
      await expect(
        extractTextFromBuffer(bigBuffer, "resume.pdf", "application/pdf")
      ).rejects.toThrow(/exceeds the 5 MB limit/);
    });

    it("handles corrupted or unreadable documents gracefully", async () => {
      const corruptPdf = Buffer.from("%PDF-corrupted-content-without-valid-structure-or-trailer");
      await expect(
        extractTextFromBuffer(corruptPdf, "corrupt.pdf", "application/pdf")
      ).rejects.toThrow();
    });
  });

  describe("Heuristic Profile Parser", () => {
    const sampleResume = `
      David Miller
      Email: david.miller@techdev.io
      Phone: +1 (555) 345-6789
      LinkedIn: linkedin.com/in/david-miller-dev
      GitHub: github.com/davidmiller-code

      PROFESSIONAL SUMMARY
      Results-driven Senior Full Stack Developer with 5+ years of experience building distributed web applications.

      TECHNICAL SKILLS
      Languages & Frameworks: TypeScript, JavaScript, Python, React, Next.js, Node.js, Express, Tailwind CSS
      Databases & Cloud: PostgreSQL, MongoDB, Redis, AWS, Docker, Kubernetes, CI/CD, Git

      WORK EXPERIENCE
      Senior Full Stack Developer - Apex Systems (2021 - Present)
      • Architected microservices with Node.js and TypeScript handling over 2M daily requests.
      • Led frontend migration to Next.js and React, improving Core Web Vitals by 45%.

      Software Engineer - CloudCore Technologies (2019 - 2021)
      • Built RESTful APIs using Python, FastAPI, and PostgreSQL.
      • Maintained CI/CD pipelines with Docker and GitHub Actions.

      EDUCATION
      B.S. in Computer Science - University of California, Berkeley (2019)

      PROJECTS
      DevPulse Monitoring Dashboard
      Built a real-time cluster metrics viewer using Next.js, WebSocket, and Redis.
    `;

    it("extracts all required profile fields without hallucinating", () => {
      const profile = parseResumeTextHeuristic(sampleResume);

      expect(profile.name).toBe("David Miller");
      expect(profile.contact.email).toBe("david.miller@techdev.io");
      expect(profile.contact.phone).toContain("555");
      expect(profile.contact.linkedin).toContain("david-miller-dev");
      expect(profile.contact.github).toContain("davidmiller-code");
      expect(profile.designation).toBe("Senior Full Stack Developer");
      expect(profile.yearsOfExperience).toBe(5);

      // Skills check
      expect(profile.skills).toContain("TypeScript");
      expect(profile.skills).toContain("React");
      expect(profile.skills).toContain("Next.js");
      expect(profile.skills).toContain("Docker");
      expect(profile.skills).toContain("PostgreSQL");

      // Experience & Education check
      expect(profile.experience.length).toBeGreaterThan(0);
      expect(profile.education.length).toBeGreaterThan(0);
      expect(profile.education[0].institution).toContain("University of California");
    });

    it("handles resumes with missing optional fields cleanly without throwing", () => {
      const minimalResume = `
        Jane Candidate
        I am a junior coder interested in web technologies.
        Skills: JavaScript, HTML, CSS
      `;

      const profile = parseResumeTextHeuristic(minimalResume);
      expect(profile.name).toBe("Jane Candidate");
      expect(profile.contact.email).toBe("");
      expect(profile.contact.phone).toBe("");
      expect(profile.experience).toEqual([]);
      expect(profile.education).toEqual([]);
      expect(profile.skills).toContain("JavaScript");
      expect(profile.skills).toContain("HTML");
    });
  });

  describe("End-to-End parseResumeFile", () => {
    it("successfully parses a valid DOCX file", async () => {
      const docx = await createTestDocxBuffer();
      const result = await parseResumeFile(docx, "applicant_cv.docx");

      expect(result.success).toBe(true);
      expect(result.profile?.name).toBe("Sarah Jenkins");
      expect(result.profile?.contact.email).toBe("sarah.j@example.com");
      expect(result.profile?.skills).toContain("Python");
      expect(result.profile?.skills).toContain("FastAPI");
      expect(result.sourceFileName).toBe("applicant_cv.docx");
    });
  });
});
