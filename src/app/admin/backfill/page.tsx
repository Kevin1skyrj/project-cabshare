"use client";
import { useEffect, useState } from "react";
import { db } from "../../constants/firebase";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { rideToText } from "../../lib/ai";

export default function BackfillPage() {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!running) return;
    (async () => {
      const snap = await getDocs(collection(db, "rides"));
      setTotal(snap.size);
      let count = 0;
      for (const d of snap.docs) {
        const data = d.data() as { pickup?: string; drop?: string; datetime?: string; ai?: { embedding?: number[] } };
        const has = data?.ai?.embedding?.length;
        if (!has) {
          const text = rideToText({ pickup: data.pickup || "", drop: data.drop || "", datetime: data.datetime });
          const { embedding } = await fetch("/api/ai/embedding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          }).then((r) => r.json());
          await updateDoc(doc(db, "rides", d.id), { ai: { ...(data.ai || {}), embedding } });
          count++;
          setDone(count);
        }
      }
      setRunning(false);
      alert(`Backfill complete. Updated ${count} rides.`);
    })();
  }, [running]);

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-xl font-semibold mb-2">Backfill Embeddings</h1>
      <p className="text-sm text-gray-600 mb-4">One-time tool to compute AI embeddings for existing rides.</p>
      <button
        onClick={() => setRunning(true)}
        disabled={running}
        className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded"
      >
        {running ? "Running…" : "Start Backfill"}
      </button>
      {total > 0 && (
        <div className="mt-3 text-sm text-gray-700">Updated {done} / {total}</div>
      )}
    </div>
  );
}
