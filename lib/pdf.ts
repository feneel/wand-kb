// lib/pdf.ts
import { spawn } from "child_process";

export type PdfExtractResult = {
  text: string;
  hasTextLayer: boolean;
  pages: number;
};

/** Run `pdftotext` (Poppler) and capture stdout. */
async function runPdfToText(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn("pdftotext", ["-layout", "-q", "-", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];

    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => err.push(d));
    p.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(out).toString("utf8").trim());
      } else {
        reject(new Error(Buffer.concat(err).toString("utf8") || `pdftotext exit ${code}`));
      }
    });
    p.stdin.end(buffer);
  });
}

/** Multi-strategy extraction:
 *  1) pdf2json  -> Node-friendly, no workers
 *  2) pdf-parse -> runtime require to avoid bundling tests
 *  3) pdftotext -> external binary (Poppler), very reliable
 */
export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  // ---- 1) Try pdf2json
  try {
    const pdf2jsonMod: any = await import("pdf2json");
    const PDFParser = pdf2jsonMod.default ?? pdf2jsonMod;

    const data: any = await new Promise((resolve, reject) => {
      const parser = new PDFParser();
      parser.on("pdfParser_dataError", (err: any) => reject(err?.parserError || err));
      parser.on("pdfParser_dataReady", (pdfData: any) => resolve(pdfData));
      parser.parseBuffer(buffer);
    });

    const pages = data?.formImage?.Pages ?? [];
    let hasTextLayer = false;

    const pageTexts = pages.map((page: any) => {
      const texts = page?.Texts || [];
      if (texts.length > 0) hasTextLayer = true;
      const decoded = texts
        .map((t: any) => (t.R || []).map((r: any) => decodeURIComponent(r.T || "")).join(""))
        .join(" ");
      return decoded;
    });

    const raw = pageTexts.join("\n").replace(/\s+\n/g, "\n");
    const text = raw.replace(/\n{3,}/g, "\n\n").trim();

    if (text.length > 0 || hasTextLayer) {
      return { text, hasTextLayer, pages: pages.length || 0 };
    }
  } catch {
    // continue
  }

  // ---- 2) Try pdf-parse via runtime require (no bundling)
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const req = (Function("return require")() as NodeRequire);
    const pdfParse = req("pdf-parse");
    const res = await pdfParse(buffer);
    const text = (res?.text ?? "").trim();
    if (text.length > 0) {
      return { text, hasTextLayer: true, pages: res?.numpages ?? 0 };
    }
  } catch {
    // continue
  }

  // ---- 3) Fallback to pdftotext binary
  try {
    const text = await runPdfToText(buffer);
    if (text.length > 0) {
      return { text, hasTextLayer: true, pages: 0 };
    }
  } catch {
    // continue
  }

  // Nothing worked: likely scanned
  return { text: "", hasTextLayer: false, pages: 0 };
}
