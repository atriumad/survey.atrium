"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createKeyword, deleteKeyword } from "./actions";

interface Keyword {
  id: string;
  keyword: string;
}

export function KeywordsSection({ keywords }: { keywords: Keyword[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Negative keywords</h2>
      <Card>
        <CardHeader>
          <CardTitle>Add keyword</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createKeyword} className="flex gap-3 items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="keyword">Keyword</Label>
              <Input id="keyword" name="keyword" placeholder="e.g. slow, dirty, cold" required className="w-64" />
            </div>
            <Button type="submit">Add</Button>
          </form>
        </CardContent>
      </Card>

      {keywords.length === 0 ? (
        <p className="text-sm text-body">You haven't added any keywords yet.</p>
      ) : (
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
      )}
    </div>
  );
}
