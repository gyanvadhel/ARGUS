import Link from "next/link";
import { LevelPill } from "@/components/app/level-pill";
import { PageHeader } from "@/components/app/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KIND_META, timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ScanKind, ScanRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS: (ScanKind | "all")[] = ["all", "url", "file", "email", "phone", "text", "call"];

type Row = Pick<ScanRow, "id" | "kind" | "input_preview" | "score" | "level" | "threat_type" | "created_at"> & { verified: boolean | null };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const active = FILTERS.includes(kind as ScanKind) ? (kind as ScanKind) : "all";
  const supabase = await createClient();
  let query = supabase
    .from("scans")
    .select("id,kind,input_preview,score,level,threat_type,created_at,verified:verdict->verified")
    .order("created_at", { ascending: false })
    .limit(200);
  if (active !== "all") query = query.eq("kind", active);
  const { data } = await query;
  const rows = (data ?? []) as Row[];

  return (
    <>
      <PageHeader eyebrow="History" title="Everything you've scanned" />
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/history" : `/history?kind=${f}`}
            className={cn(
              "rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground",
              active === f && "border-primary/60 bg-primary/10 text-foreground",
            )}
          >
            {f === "all" ? "All" : KIND_META[f].label}
          </Link>
        ))}
      </div>
      <div className="glass overflow-hidden rounded-3xl">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-28 pl-5">Type</TableHead>
              <TableHead>Scanned</TableHead>
              <TableHead className="hidden md:table-cell">Threat</TableHead>
              <TableHead>Verdict</TableHead>
              <TableHead className="hidden pr-5 text-right sm:table-cell">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const { label, icon: Icon } = KIND_META[r.kind];
              return (
                <TableRow key={r.id}>
                  <TableCell className="pl-5">
                    <Link href={`/scan/${r.id}`} className="flex items-center gap-2 text-muted-foreground"><Icon className="size-4" />{label}</Link>
                  </TableCell>
                  <TableCell className="max-w-72">
                    <Link href={`/scan/${r.id}`} className="block truncate hover:underline">{r.input_preview.split("\n")[0]}</Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{r.threat_type}</TableCell>
                  <TableCell><LevelPill level={r.level} score={r.score} verified={r.verified === true} /></TableCell>
                  <TableCell className="hidden pr-5 text-right text-xs text-muted-foreground sm:table-cell">{timeAgo(r.created_at)}</TableCell>
                </TableRow>
              );
            })}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">No scans here yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
