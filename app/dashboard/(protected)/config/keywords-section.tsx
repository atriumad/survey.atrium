"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createKeyword, deleteKeyword } from "./actions";

interface Keyword {
  id: string;
  keyword: string;
}

export function KeywordsSection({ keywords }: { keywords: Keyword[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-medium text-ink">Palabras clave negativas</h2>
      <form
        action={createKeyword}
        className="flex gap-2 rounded-[26px] bg-white p-4 shadow-card"
      >
        <Input name="keyword" placeholder="ej: lento, sucio, frio" required className="w-64" />
        <Button type="submit">Agregar</Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {keywords.map((kw) => (
          <span
            key={kw.id}
            className="flex items-center gap-1.5 rounded-full bg-amber-soft px-3 py-1 text-sm text-ink font-medium"
          >
            {kw.keyword}
            <button
              onClick={() => deleteKeyword(kw.id)}
              className="text-ink/50 hover:text-destructive transition-colors"
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}