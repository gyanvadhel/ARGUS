import Link from "next/link";
import { Search } from "lucide-react";
import { DeleteScanButton } from "@/components/app/delete-scan-button";
import { LevelPill } from "@/components/app/level-pill";
import { PageHeader } from "@/components/app/page-header";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KIND_META, timeAgo } from "@/lib/format";
import { likePattern } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import type { ScanKind, ScanRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS: (ScanKind | "all")[] = ["all", "url", "file", "email", "phone", "text", "call"];

type Row = Pick<ScanRow, "id" | "kind" | "input_preview" | "score" | "level" | "threat_type" | "created_at"> & { verified: boolean | null };

function filterHref(kind: ScanKind | "all", q: string) {
  const params = new URLSearchParams();
  if (kind !== "all") params.set("kind", kind);
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/history?${query}` : "/history";
}

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string }> }) {
  const { kind, q: rawQ } = await searchParams;
  const active = FILTERS.includes(kind as ScanKind) ? (kind as ScanKind) : "all";
  const q = (rawQ ?? "").trim().slice(0, 100);
  const supabase = await createClient();
  let query = supabase
    .from("scans")
    .select("id,kind,input_preview,score,level,threat_type,created_at,verified:verdict->verified")
    .order("created_at", { ascending: false })
    .limit(200);
  if (active !== "all") query = query.eq("kind", active);
  const pattern = likePattern(q);
  if (pattern) query = query.ilike("input_preview", pattern);
  const { data } = await query;
  const rows = (data ?? []) as Row[];

  return (
    <>
      <PageHeader eyebrow="History" title="Everything you've scanned" />
      <form action="/history" className="relative mb-4 max-w-md">
        {active !== "all" && <input type="hidden" name="kind" value={active} />}
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search links, numbers, subjects…"
          aria-label="Search your history"
          className="h-10 rounded-full pl-10"
        />
      </form>
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={filterHref(f, q)}
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
              <TableHead className="hidden w-28 pl-5 sm:table-cell">Type</TableHead>
              <TableHead className="pl-4 sm:pl-2">Scanned</TableHead>
              <TableHead className="hidden md:table-cell">Threat</TableHead>
              <TableHead>Verdict</TableHead>
              <TableHead className="hidden text-right sm:table-cell">When</TableHead>
              <TableHead className="w-12 pr-3"><span className="sr-only">Delete</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const { label, icon: Icon } = KIND_META[r.kind];
              const subject = r.input_preview.split("\n")[0];
              return (
                <TableRow key={r.id}>
                  <TableCell className="hidden pl-5 sm:table-cell">
                    <Link href={`/scan/${r.id}`} className="flex items-center gap-2 text-muted-foreground"><Icon className="size-4" />{label}</Link>
                  </TableCell>
                  {/* Phones fold the type into an icon here, so the verdict and delete button stay on screen. */}
                  <TableCell className="max-w-36 pl-4 sm:max-w-72 sm:pl-2">
                    <Link href={`/scan/${r.id}`} className="flex min-w-0 items-center gap-2 hover:underline">
                      <Icon className="size-4 shrink-0 text-muted-foreground sm:hidden" aria-label={label} />
                      <span className="truncate">{subject}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{r.threat_type}</TableCell>
                  <TableCell><LevelPill level={r.level} score={r.score} verified={r.verified === true} /></TableCell>
                  <TableCell className="hidden text-right text-xs text-muted-foreground sm:table-cell">{timeAgo(r.created_at)}</TableCell>
                  <TableCell className="pr-3"><DeleteScanButton id={r.id} subject={subject} /></TableCell>
                </TableRow>
              );
            })}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  {q ? `Nothing in your history matches “${q}”.` : "No scans here yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
