import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { embed } from "@/lib/embedding";
import { chunkTextIter } from "@/lib/chunk";
import { FieldValue } from "@google-cloud/firestore";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES   = 1 * 1024 * 1024;   // 1 MB
const MAX_TEXT_CHARS     = 900_000;           // ~900 KB
const MAX_CHUNK_CHARS    = 700;               // keep chunk docs small
const BATCH_SIZE         = 50;                // safe commit size
const FILE_PART_SIZE     = 180_000;           // split original file
const FILE_PREVIEW_CHARS = 50_000;

async function storeOriginalText(docId: string, text: string) {
  await db.collection("files").doc(docId).set({
    preview: text.slice(0, FILE_PREVIEW_CHARS),
    parts: Math.ceil(text.length / FILE_PART_SIZE),
    createdAt: new Date(),
    mime: "text/plain",
  });
  for (let i = 0; i < text.length; i += FILE_PART_SIZE) {
    const idx = Math.floor(i / FILE_PART_SIZE);
    await db.collection("files").doc(docId).collection("parts").doc(String(idx)).set({
      idx, content: text.slice(i, i + FILE_PART_SIZE),
    });
  }
}

async function indexInBackground(docId: string, text: string) {
  let batch = db.batch();
  let ops = 0;
  let count = 0;

  const flush = async () => {
    if (ops > 0) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
      await new Promise(r => setImmediate(r));
    }
  };

  try {
    for (const c of chunkTextIter(text, 1000, 200)) {
      const short = c.text.length > MAX_CHUNK_CHARS ? c.text.slice(0, MAX_CHUNK_CHARS) : c.text;
      const vector = await embed(short);
      const ref = db.collection("chunks").doc();
      batch.set(ref, {
        docId,
        page: c.page,
        order: c.order,
        text: short,
        embedding: FieldValue.vector(vector),
        createdAt: new Date(),
      });
      ops++; count++;
      if (ops >= BATCH_SIZE) await flush();
    }
    await flush();
    await db.collection("documents").doc(docId).update({ status: "ready", numChunks: count });
    console.log("[index] done", { docId, count });
  } catch (err: any) {
    console.error("[index] failed", err?.message || err);
    await db.collection("documents").doc(docId).update({
      status: "error",
      error: String(err?.message || err),
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const size = (file as any).size ?? 0;
    if (size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "TXT too large (1MB limit for demo)" }, { status: 413 });
    }

    const arrayBuf = await file.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    const name = file.name || `upload-${Date.now()}`;

    if (!name.toLowerCase().endsWith(".txt")) {
      return NextResponse.json({ error: "Only .txt files are accepted" }, { status: 400 });
    }

    let text = buf.toString("utf8").trim();
    if (!text) return NextResponse.json({ error: "Empty text file" }, { status: 400 });
    if (text.length > MAX_TEXT_CHARS) text = text.slice(0, MAX_TEXT_CHARS);

    // 1) create the doc (shows up immediately in UI)
    const docRef = db.collection("documents").doc();
    const storagePath = `firestore://files/${docRef.id}`;
    await docRef.set({
      name,
      size: buf.length,
      mime: "text/plain",
      storagePath,
      uploadedAt: new Date(),
      status: "indexing",
      numChunks: 0,
    });

    // 2) store original text in parts (safe sizes)
    await storeOriginalText(docRef.id, text);

    // 3) respond to client immediately (no empty body)
    const response = NextResponse.json({ ok: true, docId: docRef.id });
    // 4) kick off background indexing (no await)
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    indexInBackground(docRef.id, text);
    return response;
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Upload failed" }, { status: 500 });
  }
}
