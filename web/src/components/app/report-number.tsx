"use client";

import { useState, useTransition } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { reportNumber } from "@/app/(app)/scan/actions";
import { Button } from "@/components/ui/button";

const CATEGORIES = ["Scam", "Spam", "Robocall", "Fraud", "Other"];

export function ReportNumber({ e164 }: { e164: string }) {
  const [category, setCategory] = useState("Scam");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (done) return <p className="text-sm text-muted-foreground">Reported. Other Argus users will see this number flagged.</p>;
  return (
    <div className="flex items-center gap-2">
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="h-9 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm"
        aria-label="Report category"
      >
        {CATEGORIES.map((c) => <option key={c} value={c} className="bg-popover">{c}</option>)}
      </select>
      <Button
        variant="outline"
        className="h-9"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await reportNumber(e164, category, "");
            if (res.ok) {
              setDone(true);
              toast.success("Number reported to the Argus community.");
            } else toast.error(res.error);
          })
        }
      >
        <Flag className="size-3.5" /> Report number
      </Button>
    </div>
  );
}
