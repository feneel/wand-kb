import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";

export async function GET() {
  const snap = await db.collection("documents").orderBy("uploadedAt", "desc").get();
  return NextResponse.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}
