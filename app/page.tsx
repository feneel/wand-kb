"use client";
import { useEffect, useState } from "react";

type Doc = { id: string; name: string; size: number; mime: string; uploadedAt: any; storagePath?: string; numChunks?: number };
type Hit = { id: string; docId: string; order: number; text: string; score?: number; docName?: string; idx?: number };

async function safeJSON(res: Response) {
  const text = await res.text();
  try { return { ok: res.ok, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, data: { raw: text } }; }
}

export default function Home() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [missing, setMissing] = useState<string[]>([]);

  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);

  async function refreshDocs() {
    try {
      const res = await fetch("/api/docs", { cache: "no-store" });
      const { ok, data } = await safeJSON(res);
      setDocs(ok && Array.isArray(data) ? data : []);
    } catch { setDocs([]); }
  }
  useEffect(() => { refreshDocs(); }, []);

  function onDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
  function onDragEnter(e: React.DragEvent) { e.preventDefault(); setDragging(true); }
  function onDragLeave(e: React.DragEvent) { e.preventDefault(); setDragging(false); }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".txt")) { alert("Please drop a .txt file"); return; }
    setFile(f);
  }

  async function onUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 120_000);

      const res = await fetch("/api/upload", { method: "POST", body: fd, signal: ctrl.signal });
      clearTimeout(t);

      const { ok, data } = await safeJSON(res);
      if (!ok || !data?.ok) {
        console.warn("upload fail payload:", data);
        alert(data?.error || data?.raw || "Upload failed");
        return;
      }
      setFile(null);
      await refreshDocs();
    } catch (e: any) {
      alert(e?.name === "AbortError" ? "Upload timed out" : (e?.message || "Upload failed"));
    } finally {
      setUploading(false); // <-- ALWAYS clears
    }
  }

  async function onAsk() {
    if (!question.trim()) return;
    setAsking(true);
    setAnswer(""); setHits([]); setScore(null); setMissing([]);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, k: 8 })
      });
      const { ok, data } = await safeJSON(res);
      if (!ok) { alert(data?.error || data?.raw || "Query failed"); return; }
      setAnswer(data.answer || "");
      setHits(data.contexts || []);
      setScore(data.completeness?.score ?? null);
      setMissing(data.completeness?.missing ?? []);
    } catch (e: any) {
      alert(e?.message || "Query failed");
    } finally {
      setAsking(false);
    }
  }

  const traffic =
    score == null ? "bg-gray-300"
    : score >= 0.8 ? "bg-green-500"
    : score >= 0.5 ? "bg-yellow-400" : "bg-red-500";

  return (
    <main className="min-h-screen max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">AI Knowledge Base (TXT) — RAG + Completeness</h1>

      {/* Upload */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 space-y-3">
        <div className="font-medium">Upload .txt documents</div>

        <div
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`rounded border-2 border-dashed p-8 text-center text-sm transition
            ${dragging ? "border-black bg-gray-50" : "border-gray-300"}`}
        >
          Drag & drop a .txt file here
        </div>

        <div className="flex items-center gap-2">
          <input type="file" accept=".txt" onChange={e => setFile(e.target.files?.[0] || null)} />
          <button
            disabled={!file || uploading}
            onClick={onUpload}
            className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload & Index"}
          </button>
        </div>
        {file && <div className="text-xs text-gray-500">Selected: {file.name} ({(file.size/1024).toFixed(1)} KB)</div>}
      </section>

      {/* Docs */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 space-y-3">
        <div className="font-medium">Documents</div>
        <ul className="divide-y">
          {docs.map(d => (
            <li key={d.id} className="flex items-center justify-between py-2">
              <div className="min-w-0">
                <div className="font-mono text-sm truncate">{d.name}</div>
                <div className="text-xs text-gray-500">
                  {(d.size/1024).toFixed(1)} KB · {d.mime} · chunks: {d.numChunks ?? "—"} 
                </div>
              </div>
              <button
                onClick={async () => {
                  if (!confirm("Delete document and its chunks?")) return;
                  await fetch(`/api/docs/${d.id}`, { method: "DELETE" });
                  refreshDocs();
                }}
                className="text-red-600 text-sm"
              >
                Delete
              </button>
            </li>
          ))}
          {!docs.length && <li className="text-sm text-gray-500 py-2">No documents yet.</li>}
        </ul>
      </section>

      {/* Ask */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 space-y-3">
        <div className="font-medium">Ask a question</div>
        <div className="flex gap-2">
          <input value={question} onChange={e => setQuestion(e.target.value)}
                 placeholder="e.g., What was the score for SQL Knowledge?"
                 className="flex-1 border rounded px-3 py-2" />
          <button disabled={asking} onClick={onAsk}
                  className="px-3 py-2 rounded bg-black text-white disabled:opacity-50">
            {asking ? "Thinking…" : "Ask"}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${traffic}`} />
          <div className="text-sm">
            {score == null ? "Ask a question to see completeness."
              : `Completeness: ${(score*100).toFixed(0)}%`}
          </div>
        </div>

        {answer && (
          <article className="prose max-w-none">
            <h3>Answer</h3>
            <pre className="whitespace-pre-wrap text-sm">{answer}</pre>
          </article>
        )}

        {hits.length > 0 && (
          <div className="text-sm text-gray-600">
            <span className="font-medium">Sources:</span>{" "}
            {Array.from(new Set(hits.map(h => (h as any).docName ?? h.docId))).join(", ")}
          </div>
        )}

        {hits.length > 0 && (
          <div>
            <h4 className="font-medium mt-2">Citations</h4>
            <ul className="mt-1 space-y-2">
              {hits.map((h, i) => (
                <li key={h.id} className="p-2 bg-gray-50 border rounded">
                  <div className="text-xs text-gray-600">
                    #{i + 1} • {(h as any).docName ?? h.docId} • ord:{(h as any).order}
                  </div>
                  <div className="text-sm">{h.text}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {missing.length > 0 && (
          <div>
            <h4 className="font-medium mt-2">Suggested enrichment</h4>
            <ul className="list-disc pl-5 text-sm">
              {missing.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
