"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { RotateCw } from "lucide-react";
import { disconnectGmail, listInbox, scanMessage, type InboxItem } from "@/app/(app)/inbox/actions";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";
import { senderName } from "@/lib/mail-format";
import { runPool } from "@/lib/pool";
import { cn } from "@/lib/utils";
import { LevelPill } from "./level-pill";

function tally(items: InboxItem[]): string {
  const checked = items.filter((i) => i.verdict);
  if (!checked.length) return `${items.length} latest emails`;
  const risky = checked.filter((i) => i.verdict!.score >= 60).length;
  const caution = checked.filter((i) => i.verdict!.score >= 30 && i.verdict!.score < 60).length;
  const parts = [`${risky} risky`, `${caution} to be careful with`, `${checked.length - risky - caution} with no red flags`];
  return `${items.length} latest emails: ${parts.join(", ")}`;
}

export function InboxConsole({ email, justConnected }: { email: string; justConnected: boolean }) {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconnect, setReconnect] = useState(false);
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const [loading, startLoading] = useTransition();

  // Opening the page checks only new emails; "Check again" re-checks everything shown with the latest intelligence.
  const load = useCallback((recheck = false) => {
    startLoading(async () => {
      const res = await listInbox();
      if (!res.ok) {
        setError(res.error);
        setReconnect(Boolean(res.reconnect));
        return;
      }
      setError(null);
      setItems(recheck ? res.items.map((i) => ({ ...i, verdict: null })) : res.items);
      const pending = res.items.filter((i) => recheck || !i.verdict).map((i) => i.id);
      setChecking(new Set(pending));
      // Three at a time: each email's links get a live check, so the engine isn't flooded.
      await runPool(pending, 3, async (id) => {
        const result = await scanMessage(id);
        setChecking((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
        if (result.ok) setItems((list) => list?.map((i) => (i.id === id ? { ...i, verdict: result.verdict } : i)) ?? list);
        else if (result.reconnect) {
          setError(result.error);
          setReconnect(true);
        }
      });
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 0); // read the inbox as soon as the page opens
    return () => clearTimeout(t);
  }, [load]);

  if (reconnect) {
    return (
      <section className="glass max-w-3xl rounded-3xl p-8">
        <p className="text-foreground/85">{error}</p>
        <a href="/api/gmail/connect" className="mt-5 inline-flex h-10 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background">
          Connect Gmail again
        </a>
      </section>
    );
  }

  return (
    <section className="glass rounded-3xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm">
            {justConnected ? "Connected. " : ""}Watching <span className="font-medium">{email}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Read-only access. {items ? tally(items) : "Reading your latest emails…"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => load(true)} disabled={loading}>
            <RotateCw className={cn("size-3.5", loading && "animate-spin")} /> Check again
          </Button>
          <form action={disconnectGmail}>
            <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground">
              Disconnect
            </Button>
          </form>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-risk-high">{error}</p>}

      <ul className="mt-5 divide-y divide-border/60 border-t border-border/60" aria-busy={loading}>
        {items === null &&
          Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="flex animate-pulse items-center gap-4 py-4">
              <span className="h-3 w-32 rounded-full bg-white/5" />
              <span className="h-3 flex-1 rounded-full bg-white/5" />
            </li>
          ))}
        {items?.length === 0 && <li className="py-10 text-center text-muted-foreground">Your inbox is empty.</li>}
        {items?.map((item) => {
          const row = (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3.5">
              <div className="min-w-0">
                <p className="flex items-baseline gap-3">
                  <span className="truncate text-sm font-medium">{senderName(item.from)}</span>
                  <span className="truncate text-sm text-foreground/80">{item.subject}</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.snippet}</p>
              </div>
              <div className="flex items-center gap-3">
                {item.verdict ? (
                  <LevelPill level={item.verdict.level} score={item.verdict.score} verified={item.verdict.verified} />
                ) : checking.has(item.id) ? (
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="size-1.5 animate-pulse rounded-full bg-foreground/60" /> Checking
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Not checked</span>
                )}
                <span className="hidden w-14 text-right text-xs text-muted-foreground sm:block">{item.date ? timeAgo(item.date) : ""}</span>
              </div>
            </div>
          );
          return (
            <li key={item.id}>
              {item.verdict ? (
                <Link href={`/scan/${item.verdict.scanId}`} className="-mx-2 block rounded-xl px-2 transition-colors hover:bg-white/3">
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
