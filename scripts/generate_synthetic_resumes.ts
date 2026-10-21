import fs from "fs";
import path from "path";
import { createTestPdfBuffer, createTestDocxBuffer } from "../tests/helpers/testDocuments";

async function main() {
  const dir = path.join(process.cwd(), "tests", "fixtures", "synthetic");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Valid PDF
  const pdfBuffer = createTestPdfBuffer();
  fs.writeFileSync(path.join(dir, "alex_smith_resume.pdf"), pdfBuffer);

  // Valid DOCX
  const docxBuffer = await createTestDocxBuffer();
  fs.writeFileSync(path.join(dir, "sarah_jenkins_resume.docx"), docxBuffer);

  // Unsupported TXT
  fs.writeFileSync(path.join(dir, "unsupported_document.txt"), "This is plain text");

  // Empty file (0 bytes)
  fs.writeFileSync(path.join(dir, "empty_resume.pdf"), Buffer.alloc(0));

  console.log("SUCCESS_GENERATED_SYNTHETIC_DOCUMENTS");
}

main().catch((err) => {
  console.error("Error creating test files:", err);
  process.exit(1);
});
