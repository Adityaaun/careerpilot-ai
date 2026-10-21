import JSZip from "jszip";

/**
 * Creates a valid minimal PDF buffer containing the provided text
 */
export function createTestPdfBuffer(
  text = "Alex Smith\nEmail: alex.smith@example.com\nPhone: (555) 234-5678\nDesignation: Senior Full Stack Engineer\nSkills: TypeScript, React, Next.js, Node.js, PostgreSQL, AWS, Docker\nExperience: Senior Full Stack Engineer at Acme Corp 2021 - Present\nEducation: B.S. Computer Science from MIT 2020\nProjects: CareerPilot AI - Built real-time job assistant"
): Buffer {
  const sanitizedText = text.replace(/[\r\n]+/g, " ");
  const streamContent = `BT /F1 12 Tf 50 750 Td (${sanitizedText.slice(0, 150)}) Tj ET`;

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamContent.length} >>
stream
${streamContent}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000350 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
426
%%EOF`;

  return Buffer.from(pdf);
}

/**
 * Creates a valid minimal DOCX buffer containing the provided text
 */
export async function createTestDocxBuffer(
  paragraphs: string[] = [
    "Sarah Jenkins",
    "Email: sarah.j@example.com | Phone: 415-555-0199",
    "Designation: Backend Software Engineer",
    "Skills: Python, FastAPI, Django, PostgreSQL, Redis, Docker, Kubernetes, AWS",
    "Experience: Backend Engineer at CloudTech (2022 - Present)",
    "Built microservices handling 10k req/sec with FastAPI and Redis",
    "Education: Bachelor of Science in Computer Engineering, Stanford University 2021",
    "Projects: CloudQueue - High throughput distributed job queue in Go and Redis",
  ]
): Promise<Buffer> {
  const zip = new JSZip();

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const paragraphsXml = paragraphs
    .map((p) => `<w:p><w:r><w:t>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</w:t></w:r></w:p>`)
    .join("");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphsXml}
  </w:body>
</w:document>`;

  zip.file("[Content_Types].xml", contentTypes);
  zip.file("_rels/.rels", rels);
  zip.file("word/document.xml", documentXml);

  return (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;
}
