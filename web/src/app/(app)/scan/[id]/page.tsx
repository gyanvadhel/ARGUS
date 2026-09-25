import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { VerdictView } from "@/components/app/verdict-view";
import { createClient } from "@/lib/supabase/server";
import type { ScanRow } from "@/lib/types";

export default async function SavedScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // An invalid UUID makes Postgres return an error; data is then null and we show the 404.
  const { data } = await supabase.from("scans").select("*").eq("id", id).maybeSingle<ScanRow>();
  if (!data) notFound();
  return (
    <>
      <Link href="/history" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> History
      </Link>
      <PageHeader
        eyebrow={new Date(data.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
        title="Saved verdict"
      />
      <VerdictView verdict={data.verdict} />
    </>
  );
}
