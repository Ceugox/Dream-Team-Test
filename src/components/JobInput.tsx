// src/components/JobInput.tsx
"use client";

import { useState } from "react";

export function JobInput({ onSubmit, loading }: { onSubmit: (text: string) => void; loading: boolean }) {
  const [text, setText] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a job description"
        rows={8}
        className="w-full rounded border border-neutral-300 px-3 py-2 font-mono text-sm"
      />
      <button
        onClick={() => onSubmit(text)}
        disabled={loading || text.trim().length === 0}
        className="w-fit rounded-full bg-black px-6 py-3 text-white disabled:opacity-50"
      >
        {loading ? "Finding referrals..." : "Find people to refer"}
      </button>
    </div>
  );
}
