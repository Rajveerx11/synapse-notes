import { Notebook, Page, AiCard } from "./types";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } from "docx";
import PptxGenJS from "pptxgenjs";
import * as XLSX from "xlsx";
import { PDFDocument, rgb } from "pdf-lib";

/**
 * Trigger direct file download in the browser
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Capture current visible canvas or PDF layer snapshot with white background
 */
export function getActiveCanvasSnapshot(): string | null {
  if (typeof document === "undefined") return null;

  // 1. Blank Canvas Mode
  const mainCanvas = document.getElementById("main-canvas") as HTMLCanvasElement | null;
  if (mainCanvas && mainCanvas.width > 0 && mainCanvas.height > 0) {
    try {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = mainCanvas.width;
      tempCanvas.height = mainCanvas.height;
      const ctx = tempCanvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        ctx.drawImage(mainCanvas, 0, 0);
        return tempCanvas.toDataURL("image/png");
      }
      return mainCanvas.toDataURL("image/png");
    } catch (e) {
      console.warn("Canvas snapshot error:", e);
    }
  }

  // 2. PDF Annotation Mode (Composite PDF + Ink)
  const canvases = document.querySelectorAll("canvas");
  if (canvases.length >= 2) {
    try {
      const pdfCanvas = canvases[0];
      const drawCanvas = canvases[1];
      if (pdfCanvas.width > 0 && pdfCanvas.height > 0) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = pdfCanvas.width;
        tempCanvas.height = pdfCanvas.height;
        const ctx = tempCanvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
          ctx.drawImage(pdfCanvas, 0, 0);
          ctx.drawImage(drawCanvas, 0, 0);
          return tempCanvas.toDataURL("image/png");
        }
      }
    } catch (e) {
      console.warn("PDF composite snapshot error:", e);
    }
  }

  return null;
}

/**
 * 1. Export Canvas / Drawing as PNG or JPEG Image
 */
export async function exportCanvasToImage(
  format: "png" | "jpeg" = "png",
  title = "notebook-canvas"
) {
  const snapshotDataUrl = getActiveCanvasSnapshot();
  if (!snapshotDataUrl) throw new Error("Could not capture canvas snapshot");

  const cleanTitle = title.replace(/[^a-zA-Z0-9_-]/g, "_");
  const extension = format === "jpeg" ? "jpg" : "png";

  const res = await fetch(snapshotDataUrl);
  const blob = await res.blob();

  downloadBlob(blob, `${cleanTitle}.${extension}`);
  return snapshotDataUrl;
}

/**
 * 2. Export Notebook to PDF (.pdf)
 */
export async function exportToPDF(
  notebook: Notebook,
  pages: Page[],
  canvasSnapshotDataUrl?: string | null
) {
  const cleanTitle = (notebook.title || "Notebook").replace(/[^a-zA-Z0-9_-]/g, "_");
  const pdfDoc = await PDFDocument.create();

  if (canvasSnapshotDataUrl && canvasSnapshotDataUrl.startsWith("data:image/")) {
    const base64Data = canvasSnapshotDataUrl.split(",")[1];
    const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const image = await pdfDoc.embedPng(imageBytes);
    const { width, height } = image.scale(0.5);
    const page = pdfDoc.addPage([Math.max(595.28, width), Math.max(841.89, height)]);
    page.drawImage(image, {
      x: 0,
      y: page.getHeight() - height,
      width,
      height,
    });
  } else {
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    page.drawText(notebook.title || "Untitled Notebook", {
      x: 50,
      y: 780,
      size: 22,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(`Subject: ${notebook.subject || "General Notes"}`, {
      x: 50,
      y: 750,
      size: 13,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
  downloadBlob(blob, `${cleanTitle}.pdf`);
}

/**
 * 3. Export Notebook to Microsoft Word (.docx) / Google Docs
 */
export async function exportToWord(
  notebook: Notebook,
  pages: Page[],
  cards: AiCard[],
  canvasSnapshotDataUrl?: string | null
) {
  const cleanTitle = (notebook.title || "Notebook").replace(/[^a-zA-Z0-9_-]/g, "_");
  const nowStr = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const children: Paragraph[] = [
    // Document Title
    new Paragraph({
      text: notebook.title || "Untitled Notebook",
      heading: HeadingLevel.TITLE,
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Subject: ", bold: true, color: "2D6EF6" }),
        new TextRun({ text: `${notebook.subject || "General Notes"}    |    ` }),
        new TextRun({ text: "Exported: ", bold: true, color: "2D6EF6" }),
        new TextRun({ text: `${nowStr}    |    ` }),
        new TextRun({ text: "Synapse Notes AI", italics: true, color: "888888" }),
      ],
      spacing: { after: 300 },
    }),
    new Paragraph({
      text: "Notebook Overview & Contents",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Total Pages: ${pages.length}   •   AI Study Cards: ${cards.length}\n` }),
      ],
      spacing: { after: 200 },
    }),
  ];

  // Optional: Embed current drawing snapshot
  if (canvasSnapshotDataUrl && canvasSnapshotDataUrl.startsWith("data:image/")) {
    try {
      const base64Data = canvasSnapshotDataUrl.split(",")[1];
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      children.push(
        new Paragraph({
          text: "Handwritten Notes & Visual Canvas",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        }),
        new Paragraph({
          children: [
            new ImageRun({
              data: bytes,
              transformation: {
                width: 580,
                height: 380,
              },
              type: "png",
            }),
          ],
          spacing: { after: 300 },
        })
      );
    } catch (err) {
      console.warn("Failed to embed canvas snapshot into DOCX:", err);
    }
  }

  // Pages Section
  children.push(
    new Paragraph({
      text: "Lecture Notes & Transcriptions",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 120 },
    })
  );

  for (const p of pages) {
    children.push(
      new Paragraph({
        text: `Page ${p.page_number}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 150, after: 80 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: p.text_content ? p.text_content : "(Handwritten strokes recorded on canvas)",
            italics: !p.text_content,
          }),
        ],
        spacing: { after: 150 },
      })
    );
  }

  // AI Study Cards Section
  if (cards.length > 0) {
    children.push(
      new Paragraph({
        text: "AI Study Cards & Exam Summaries",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 120 },
      })
    );

    for (const c of cards) {
      children.push(
        new Paragraph({
          text: c.title,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 180, after: 80 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: c.content,
            }),
          ],
          spacing: { after: 120 },
        })
      );

      if (c.diagram_data && c.diagram_type !== "none") {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `Diagram (${c.diagram_type}):\n`, bold: true, color: "2D6EF6" }),
              new TextRun({ text: c.diagram_data, font: "Courier New" }),
            ],
            spacing: { after: 180 },
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${cleanTitle}.docx`);
}

/**
 * 4. Export Notebook to Microsoft PowerPoint (.pptx) / Google Slides
 */
export async function exportToPowerPoint(
  notebook: Notebook,
  pages: Page[],
  cards: AiCard[],
  canvasSnapshotDataUrl?: string | null
) {
  const pptx = new PptxGenJS();
  const cleanTitle = (notebook.title || "Notebook").replace(/[^a-zA-Z0-9_-]/g, "_");
  const nowStr = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Slide 1: Title Slide (Accent Theme)
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: "111827" };

  titleSlide.addText("SYNAPSE NOTES", {
    x: 0.8,
    y: 1.2,
    fontSize: 14,
    color: "2D6EF6",
    bold: true,
    fontFace: "Arial",
  });

  titleSlide.addText(notebook.title || "Untitled Notebook", {
    x: 0.8,
    y: 1.8,
    w: 8.4,
    fontSize: 32,
    color: "FFFFFF",
    bold: true,
    fontFace: "Arial",
  });

  titleSlide.addText(`Subject: ${notebook.subject || "General Notes"}   •   Date: ${nowStr}`, {
    x: 0.8,
    y: 3.2,
    fontSize: 16,
    color: "9CA3AF",
    fontFace: "Arial",
  });

  titleSlide.addText(`Total Pages: ${pages.length}   •   AI Study Decks: ${cards.length}`, {
    x: 0.8,
    y: 4.0,
    fontSize: 14,
    color: "6B7280",
    fontFace: "Arial",
  });

  // Slide 2..N: Page Slides
  for (const p of pages) {
    const slide = pptx.addSlide();
    slide.background = { color: "F8F9FA" };

    slide.addText(`${notebook.title} — Page ${p.page_number}`, {
      x: 0.6,
      y: 0.4,
      w: 8.8,
      fontSize: 20,
      bold: true,
      color: "1F2937",
    });

    if (canvasSnapshotDataUrl && p.page_number === 1) {
      slide.addImage({
        data: canvasSnapshotDataUrl,
        x: 0.6,
        y: 1.2,
        w: 5.2,
        h: 3.8,
      });

      slide.addText(
        p.text_content || "Handwritten notes recorded directly on canvas with stylus.",
        {
          x: 6.0,
          y: 1.2,
          w: 3.4,
          h: 3.8,
          fontSize: 14,
          color: "374151",
          valign: "top",
        }
      );
    } else {
      slide.addText(
        p.text_content || "Handwritten notes recorded directly on canvas.",
        {
          x: 0.6,
          y: 1.4,
          w: 8.8,
          h: 4.0,
          fontSize: 16,
          color: "374151",
          valign: "top",
        }
      );
    }
  }

  // Study Cards Slides
  for (const c of cards) {
    const cardSlide = pptx.addSlide();
    cardSlide.background = { color: "FFFFFF" };

    cardSlide.addShape(pptx.ShapeType.rect, {
      x: 0.6,
      y: 0.4,
      w: 2.2,
      h: 0.4,
      fill: { color: "EEF2FF" },
      line: { color: "2D6EF6", width: 1 },
    });
    cardSlide.addText("AI STUDY CARD", {
      x: 0.6,
      y: 0.4,
      w: 2.2,
      h: 0.4,
      fontSize: 11,
      bold: true,
      color: "2D6EF6",
      align: "center",
    });

    cardSlide.addText(c.title, {
      x: 0.6,
      y: 1.0,
      w: 8.8,
      fontSize: 22,
      bold: true,
      color: "111827",
    });

    cardSlide.addText(c.content, {
      x: 0.6,
      y: 1.6,
      w: 8.8,
      h: 3.6,
      fontSize: 14,
      color: "4B5563",
      valign: "top",
    });
  }

  await pptx.writeFile({ fileName: `${cleanTitle}.pptx` });
}

/**
 * 5. Export Notebook to Microsoft Excel (.xlsx) / Google Sheets
 */
export function exportToExcel(
  notebook: Notebook,
  pages: Page[],
  cards: AiCard[]
) {
  const cleanTitle = (notebook.title || "Notebook").replace(/[^a-zA-Z0-9_-]/g, "_");
  const wb = XLSX.utils.book_new();

  // Sheet 1: Notebook Overview
  const overviewData = [
    ["Synapse Notes — Export Summary", ""],
    ["Notebook ID", notebook.id],
    ["Title", notebook.title || "Untitled Notebook"],
    ["Subject", notebook.subject || "General Notes"],
    ["Total Pages", pages.length],
    ["AI Study Cards", cards.length],
    ["Created At", new Date(notebook.created_at * 1000).toLocaleString("en-IN")],
    ["Last Updated", new Date(notebook.updated_at * 1000).toLocaleString("en-IN")],
  ];
  const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
  XLSX.utils.book_append_sheet(wb, wsOverview, "Overview");

  // Sheet 2: Pages & Notes
  const pagesData = [
    ["Page Number", "Text Content / Transcription", "Has PDF Attachment", "PDF URL", "Last Updated"],
    ...pages.map(p => [
      p.page_number,
      p.text_content || "(Handwritten canvas)",
      p.pdf_url ? "Yes" : "No",
      p.pdf_url || "",
      new Date(p.updated_at * 1000).toLocaleString("en-IN"),
    ]),
  ];
  const wsPages = XLSX.utils.aoa_to_sheet(pagesData);
  XLSX.utils.book_append_sheet(wb, wsPages, "Pages & Notes");

  // Sheet 3: AI Study Cards
  const cardsData = [
    ["Card ID", "Page Reference", "Title", "Concept / Formulation", "Diagram Type", "Created At"],
    ...cards.map(c => [
      c.id,
      pages.find(p => p.id === c.page_id)?.page_number || 1,
      c.title,
      c.content,
      c.diagram_type || "none",
      new Date(c.created_at * 1000).toLocaleString("en-IN"),
    ]),
  ];
  const wsCards = XLSX.utils.aoa_to_sheet(cardsData);
  XLSX.utils.book_append_sheet(wb, wsCards, "AI Study Cards");

  XLSX.writeFile(wb, `${cleanTitle}.xlsx`);
}
