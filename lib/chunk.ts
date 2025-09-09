export type Chunk = { page: number; order: number; text: string };

export function* chunkTextIter(fullText: string, targetChars = 1000, overlap = 200): Generator<Chunk> {
  const clean = fullText
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  let i = 0, order = 0;
  while (i < clean.length) {
    const end = Math.min(clean.length, i + targetChars);
    const slice = clean.slice(i, end);
    yield { page: 0, order: order++, text: slice };
    i = end - overlap;
    if (i < 0) i = 0;
  }
}
