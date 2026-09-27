"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { deleteScan } from "@/app/(app)/history/actions";

function Submit({ subject }: { subject: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Delete the scan of ${subject}`}
      className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-risk-high disabled:opacity-40"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

export function DeleteScanButton({ id, subject }: { id: string; subject: string }) {
  return (
    <form
      action={deleteScan}
      onSubmit={(e) => {
        if (!window.confirm("Delete this scan from your history?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Submit subject={subject} />
    </form>
  );
}
