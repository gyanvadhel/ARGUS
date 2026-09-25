import Link from "next/link";
import { ScanSearch } from "lucide-react";
import { KindBreakdown } from "@/components/app/kind-breakdown";
import { PageHeader } from "@/components/app/page-header";
import { ProtectionStatus } from "@/components/app/protection-status";
import { RecentScans } from "@/components/app/recent-scans";
import { StatCard } from "@/components/app/stat-card";
import { ThreatsChart } from "@/components/app/threats-chart";
import { buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api";
import { summarize } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import type { ScanRow } from "@/lib/types";
import { cn } from "@/lib/utils";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

type Row = Pick<ScanRow, "id" | "kind" | "input_preview" | "score" | "level" | "created_at">;

export default async function DashboardPage() {
  const supabase = await createClient();
  const [{ data: { user } }, { data: rows }, health] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("scans").select("id,kind,input_preview,score,level,created_at").order("created_at", { ascending: false }).limit(500),
    api.health().catch(() => null),
  ]);
  const scans = (rows ?? []) as Row[];
  const stats = summarize(scans);
  const firstName = String(user?.user_metadata?.full_name ?? "").split(" ")[0] || "there";

  return (
    <>
      <PageHeader eyebrow="Overview" title={`${greeting()}, ${firstName}.`} subtitle="Everything Argus has checked for you.">
        <Link href="/scan" className={cn(buttonVariants(), "h-10 rounded-full px-5")}>
          <ScanSearch className="size-4" /> New scan
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total scans" value={stats.total} tone="var(--foreground)" />
        <StatCard label="Threats caught" value={stats.threats} tone="var(--risk-sus)" hint="Suspicious or worse" />
        <StatCard label="High risk" value={stats.highRisk} tone="var(--risk-high)" />
        <StatCard label="Safe" value={stats.safe} tone="var(--risk-safe)" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="glass rounded-3xl p-6 lg:col-span-2">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-serif text-2xl">Scans and threats, last 14 days</h2>
          </div>
          <ThreatsChart data={stats.series} />
        </section>
        <section className="glass rounded-3xl p-6">
          <h2 className="mb-5 font-serif text-2xl">Protection status</h2>
          <ProtectionStatus sources={health?.sources ?? null} />
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="glass rounded-3xl p-6">
          <h2 className="mb-5 font-serif text-2xl">By channel</h2>
          <KindBreakdown data={stats.byKind} />
        </section>
        <section className="glass rounded-3xl p-6 lg:col-span-2">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-serif text-2xl">Recent activity</h2>
            <Link href="/history" className="text-sm text-muted-foreground hover:text-foreground">View all</Link>
          </div>
          {scans.length ? (
            <RecentScans rows={scans.slice(0, 6)} />
          ) : (
            <div className="py-10 text-center">
              <p className="text-muted-foreground">Nothing scanned yet.</p>
              <Link href="/scan" className={cn(buttonVariants({ variant: "outline" }), "mt-4 h-9 rounded-full px-4")}>
                Run your first scan
              </Link>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
