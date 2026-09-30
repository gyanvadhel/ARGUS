"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { joinFamily, type JoinResult } from "./actions";

export function JoinButton({ code }: { code: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<JoinResult | null>(null);
  if (result?.ok) {
    return <p className="mt-8 text-lg">You and {result.name} are now family on Argus.</p>;
  }
  return (
    <div className="mt-8">
      <Button className="h-11 rounded-full px-6" disabled={pending} onClick={() => start(async () => setResult(await joinFamily(code)))}>
        {pending ? "Joining…" : "Join the family"}
      </Button>
      {result && !result.ok && <p className="mt-3 text-sm text-risk-high" role="alert">{result.error}</p>}
    </div>
  );
}
