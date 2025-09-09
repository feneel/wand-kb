// app/api/docs/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";

export const runtime = "nodejs";

// Batched delete helper
async function deleteQueryBatched(
  colRef: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>,
  batchSize = 450
) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await colRef.limit(batchSize).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    await new Promise((r) => setImmediate(r));
  }
}

// 👇 NOTE: `params` must be awaited
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params; // <-- important change

  try {
    // 1) delete chunks (batched)
    await deleteQueryBatched(db.collection("chunks").where("docId", "==", id));

    // 2) delete file parts (batched)
    const partsCol = db.collection("files").doc(id).collection("parts");
    await deleteQueryBatched(partsCol);

    // 3) delete file + document metadata
    const batch = db.batch();
    batch.delete(db.collection("files").doc(id));
    batch.delete(db.collection("documents").doc(id));
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[delete] failed", e);
    return NextResponse.json(
      { error: e?.message || "Delete failed" },
      { status: 500 }
    );
  }
}
