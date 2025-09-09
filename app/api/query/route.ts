import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { embed, chat } from "@/lib/embedding";

export const runtime = "nodejs";

// Simple lexical helpers for fallback
function keywordize(q: string) {
  const stop = new Set(["the","a","an","and","or","of","to","in","for","on","with","at","by","from","as","is","are","was","were","be","been","it","this","that","these","those","i","you","we","they","he","she"]);
  return q.toLowerCase().match(/[a-z0-9+/.-]{3,}/g)?.filter(w => !stop.has(w)) ?? [];
}
function extractSnippets(text: string, kw: string, span = 160) {
  const lc = text.toLowerCase();
  const out: string[] = [];
  let i = 0;
  while ((i = lc.indexOf(kw.toLowerCase(), i)) !== -1) {
    const start = Math.max(0, i - span);
    const end = Math.min(text.length, i + kw.length + span);
    out.push(text.slice(start, end));
    i += kw.length;
    if (out.length >= 2) break; // cap per kw
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const { question, k = 8, distanceMeasure = "COSINE" } = await req.json();
    if (!question?.trim()) {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }

    // 1) Vector search
    const qvec = await embed(question);
    // @ts-ignore Firestore vector search
    const snap = await db.collection("chunks")
      .findNearest({ vectorField: "embedding", queryVector: qvec, limit: k, distanceMeasure })
      .get();

    let contexts = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    // 2) If empty, lexical fallback over file previews (cheap + fast)
    if (contexts.length === 0) {
      const kws = keywordize(question);
      const filesSnap = await db.collection("files").get();

      // Map docId -> docName
      const docsSnap = await db.collection("documents").get();
      const idToName: Record<string,string> = Object.fromEntries(docsSnap.docs.map(s => [s.id, (s.data() as any)?.name || s.id]));

      const candidates: { docId: string; docName: string; text: string }[] = [];
      filesSnap.docs.forEach(s => {
        const docId = s.id;
        const preview = (s.data() as any)?.preview || "";
        let hits = 0;
        const snips = new Set<string>();
        for (const kw of kws) {
          const parts = extractSnippets(preview, kw);
          parts.forEach(p => { snips.add(p); hits++; });
        }
        if (hits > 0) {
          candidates.push({ docId, docName: idToName[docId] || docId, text: Array.from(snips).slice(0,3).join("\n") });
        }
      });
      candidates.sort((a,b) => b.text.length - a.text.length);
      contexts = candidates.slice(0, 5).map((c, i) => ({
        id: `lex-${i}`, docId: c.docId, docName: c.docName, order: i, text: c.text
      }));
    } else {
      // Attach friendly names
      const docIds = Array.from(new Set(contexts.map(c => c.docId)));
      const docSnaps = await Promise.all(docIds.map(id => db.collection("documents").doc(id).get()));
      const idToName = Object.fromEntries(docSnaps.map(s => [s.id, (s.data() as any)?.name || s.id]));
      contexts = contexts.map((c, i) => ({ ...c, docName: idToName[c.docId] || c.docId, order: c.order ?? i }));
    }

    if (contexts.length === 0) {
      return NextResponse.json({
        answer: "I couldn’t find relevant information in your documents.",
        contexts: [],
        completeness: {
          score: 0.2,
          reasons: ["No matching content found"],
          missing: [
            "Upload .txt documents that contain the information you’re asking for",
            "Ask a more specific question using terms present in your files"
          ]
        }
      });
    }

    // 3) Build prompt with inline citations
    const ctxBlock = contexts.map((c, i) => `[#${i+1}] (${c.docName}) ${c.text}`).join("\n\n");
    const userPrompt = `
Answer the question strictly from the context. Use inline citations like [#n].

Question:
${question}

Context:
${ctxBlock}
`;
    const answer = await chat(userPrompt);

    // 4) Completeness judge
    const judgePrompt = `
Return JSON {"score":0..1,"missing":["..."],"reasons":["..."]} judging completeness.

Question: ${question}
Answer: ${answer}
ContextChunks: ${contexts.length}
`;
    let completeness = { score: 0.7, missing: [] as string[], reasons: [] as string[] };
    try {
      const j = await chat(judgePrompt, { json: true });
      if (typeof j?.score === "number") completeness.score = Math.max(0, Math.min(1, j.score));
      if (Array.isArray(j?.missing)) completeness.missing = j.missing;
      if (Array.isArray(j?.reasons)) completeness.reasons = j.reasons;
    } catch {}

    return NextResponse.json({ answer, contexts, completeness });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Query failed" }, { status: 500 });
  }
}
