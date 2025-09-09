import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small"; // 1536 dims
const CHAT_MODEL  = process.env.CHAT_MODEL  || "gpt-4o-mini";

export async function embed(text: string): Promise<number[]> {
  const res = await client.embeddings.create({
    model: EMBED_MODEL,
    input: text.trim()
  });
  return res.data[0].embedding as number[];
}

type ChatOpts = { temperature?: number; json?: boolean; system?: string; };
export async function chat(prompt: string, opts: ChatOpts = {}) {
  const res = await client.chat.completions.create({
    model: CHAT_MODEL,
    temperature: opts.temperature ?? 0.2,
    response_format: opts.json ? { type: "json_object" } : undefined,
    messages: [
      { role: "system", content: opts.system || "You are a concise, reliable assistant." },
      { role: "user", content: prompt }
    ]
  });
  const content = res.choices[0]?.message?.content ?? "";
  if (!opts.json) return content;
  const cleaned = content.replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch { return cleaned; }
}
