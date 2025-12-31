# Wand KB — AI Knowledge Base (TXT)

A small RAG app: upload **.txt** files, ask questions, get **LLM answers with citations**, plus a **completeness** signal and **enrichment suggestions**.

* **Stack:** Next.js (App Router), Tailwind, Firestore **Vector Search**, OpenAI (embeddings + chat)
* **Scope:** TXT-only for reliability

---


## Design decisions

* **TXT-only ingestion:** predictable parsing in 24h; focus on retrieval/UX instead of PDF/OCR edge cases.
* **Background indexing:** upload returns immediately; chunking/embeddings run after response → no stuck spinners/timeouts.
* **Micro-batches & small writes:** ≤50 writes per commit, store ≤700 chars per chunk → avoids Firestore “write too big”.
* **Hybrid retrieval:** vector search first; lexical preview scan as a fallback for tiny corpora/short fact queries.

---

## Trade-offs (24h)

* No PDF/OCR; can be added later.
* Polling for status (simple) vs. SSE/WebSockets.
* Single-tenant Firestore; no multi-user auth in this demo.

---


## How to test

1. **Upload** a small `.txt` (drag & drop or file picker).
   You’ll see `status: indexing` → then `ready`, with `chunks: N` and a non-null `stored:` path.

2. **Ask** a question that exists in the text (e.g., “What was the score for SQL Knowledge?”).
   You’ll get an answer with inline `[ #n ]` citations, **Sources**, and a completeness indicator.

3. **Try an uncovered question** to see low completeness and enrichment suggestions.

4. **Delete** a document and confirm its chunks and file parts disappear.

---

## Notes

* This demo assumes a single user/project.
* PDFs/other formats can be added (PDF parser + OCR) once stability is not a constraint.
* Real-time status can be upgraded to Firestore `onSnapshot`/SSE; answers can be streamed if desired.

---

**Copyright © 2025 \<Feneel Doshi>. All rights reserved.**
