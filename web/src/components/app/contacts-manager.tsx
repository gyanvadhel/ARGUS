"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { BellOff, BellRing, Link2Off, Send, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  addContact,
  checkTelegram,
  deleteContact,
  disconnectTelegram,
  sendTestAlert,
  telegramLink,
  toggleAlerts,
  type LinkResult,
} from "@/app/(app)/family/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { timeAgo } from "@/lib/format";

export type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notify_high_risk: boolean;
  telegram: boolean;
  telegram_name: string | null;
};
export type AlertRow = {
  id: string;
  kind: "scan" | "call" | "test";
  subject: string;
  score: number;
  status: "sent" | "failed";
  created_at: string;
  trusted_contacts: { name: string } | null;
};

const POLL_MS = 3000;
const POLL_FOR_MS = 5 * 60 * 1000;

/** The QR code and link a contact opens to connect; waits for them to press Start. */
function ConnectPanel({ contact, onDone }: { contact: Contact; onDone: () => void }) {
  const [link, setLink] = useState<Extract<LinkResult, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const poll = async () => {
      if (stop) return;
      const res = await checkTelegram(contact.id);
      if (stop) return;
      if (res.linked) {
        setConnected(res.name);
        toast.success(`${contact.name} is connected on Telegram. Argus sent them a welcome message.`);
        return;
      }
      if (Date.now() - started < POLL_FOR_MS) timer = setTimeout(poll, POLL_MS);
    };
    void telegramLink(contact.id).then((res) => {
      if (stop) return;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLink(res);
      timer = setTimeout(poll, POLL_MS);
    });
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [contact.id, contact.name]);

  if (error) return <p className="mt-3 text-sm text-risk-high">{error}</p>;
  if (connected) {
    return (
      <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-border/70 p-4 text-sm">
        <span>Connected as {connected}. Alerts will reach {contact.name} on Telegram.</span>
        <Button size="sm" variant="outline" className="rounded-full" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-3 grid grid-cols-1 gap-5 rounded-2xl border border-border/70 p-5 sm:grid-cols-[160px_minmax(0,1fr)]">
      <div className="aspect-square w-40 rounded-xl border border-border/60 p-2" aria-label="QR code to connect on Telegram">
        {link ? (
          // Safe to inject: an SVG we generated on the server from our own link.
          <div className="size-full [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: link.qr }} />
        ) : (
          <div className="size-full animate-pulse rounded-lg bg-white/5" />
        )}
      </div>
      <div className="min-w-0 text-sm">
        <p className="font-medium">Connect {contact.name} on Telegram</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted-foreground">
          <li>They scan this with their phone camera, or open the link.</li>
          <li>Telegram opens @{link?.bot ?? "…"}; they press Start.</li>
        </ol>
        {link && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                void navigator.clipboard.writeText(link.link);
                toast.success("Link copied. Send it to them on WhatsApp or anywhere.");
              }}
            >
              Copy link
            </Button>
            <a href={link.link} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-full border border-border px-3 text-xs hover:border-foreground/40">
              Open in Telegram
            </a>
          </div>
        )}
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-foreground/60" /> Waiting for them to press Start…
        </p>
        <button type="button" onClick={onDone} className="mt-2 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Cancel
        </button>
      </div>
    </div>
  );
}

function describe(a: AlertRow): string {
  const who = a.trusted_contacts?.name ?? "a removed contact";
  if (a.kind === "test") return `Test alert to ${who}`;
  if (a.kind === "call") return `Told ${who} about a call from ${a.subject} (${a.score})`;
  return `Told ${who} about something rated ${a.score}`;
}

export function ContactsManager({ contacts, alerts, telegram }: { contacts: Contact[]; alerts: AlertRow[]; telegram: boolean }) {
  const [state, action, pending] = useActionState(addContact, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [testing, startTest] = useTransition();
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <section className="glass rounded-3xl p-6">
          <h2 className="font-serif text-2xl">Trusted contacts</h2>
          {contacts.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">No one yet. Add a family member who should hear about high-risk scams.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border/60">
              {contacts.map((c) => (
                <li key={c.id} className="py-4">
                  <div className="flex items-center gap-4">
                    <div className="grid size-10 shrink-0 place-items-center rounded-full bg-linear-to-br from-aurora-1/40 to-aurora-3/30 font-serif text-lg">
                      {c.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.telegram ? `On Telegram as ${c.telegram_name ?? "connected"}` : telegram ? "Not on Telegram yet" : [c.email, c.phone].filter(Boolean).join(", ") || "No way to reach them yet"}
                      </p>
                    </div>
                    {telegram && !c.telegram && connecting !== c.id && (
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => setConnecting(c.id)}>
                        Connect Telegram
                      </Button>
                    )}
                    {c.telegram && (
                      <Button
                        variant="ghost"
                        className="size-9"
                        disabled={testing}
                        aria-label={`Send ${c.name} a test alert`}
                        onClick={() =>
                          startTest(async () => {
                            const res = await sendTestAlert(c.id);
                            if (res.sent) toast.success(`Test alert sent to ${c.name} on Telegram.`);
                            else toast.error(`Telegram didn't deliver it. ${c.name} may have blocked the bot; connect them again.`);
                          })
                        }
                      >
                        <Send className="size-4" />
                      </Button>
                    )}
                    <form action={toggleAlerts}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="value" value={String(!c.notify_high_risk)} />
                      <Button variant="ghost" type="submit" className="size-9" aria-label={c.notify_high_risk ? `Turn off alerts for ${c.name}` : `Turn on alerts for ${c.name}`}>
                        {c.notify_high_risk ? <BellRing className="size-4 text-aurora-2" /> : <BellOff className="size-4 text-muted-foreground" />}
                      </Button>
                    </form>
                    {c.telegram && (
                      <form action={disconnectTelegram}>
                        <input type="hidden" name="id" value={c.id} />
                        <Button variant="ghost" type="submit" className="size-9" aria-label={`Disconnect ${c.name}'s Telegram`}>
                          <Link2Off className="size-4" />
                        </Button>
                      </form>
                    )}
                    <form action={deleteContact}>
                      <input type="hidden" name="id" value={c.id} />
                      <Button variant="ghost" type="submit" className="size-9" aria-label={`Remove ${c.name}`}>
                        <Trash2 className="size-4" />
                      </Button>
                    </form>
                  </div>
                  {connecting === c.id && <ConnectPanel contact={c} onDone={() => setConnecting(null)} />}
                </li>
              ))}
            </ul>
          )}
        </section>

        {alerts.length > 0 && (
          <section className="glass rounded-3xl p-6">
            <h2 className="font-serif text-2xl">Recent alerts</h2>
            <ul className="mt-3 divide-y divide-border/60">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                  <span className="min-w-0 truncate">{describe(a)}</span>
                  <span className={a.status === "sent" ? "shrink-0 text-xs text-muted-foreground" : "shrink-0 text-xs text-risk-high"}>
                    {a.status === "sent" ? timeAgo(a.created_at) : "not delivered"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <section className="glass h-fit rounded-3xl p-6">
        <h2 className="font-serif text-2xl">Add someone</h2>
        <form ref={formRef} action={action} className="mt-4 space-y-3">
          <Input name="name" placeholder="Name" aria-label="Name" required maxLength={100} className="h-10" />
          <Input name="phone" placeholder="Phone (optional)" aria-label="Phone" maxLength={32} className="h-10" />
          <Input name="email" type="email" placeholder="Email (optional)" aria-label="Email" maxLength={254} className="h-10" />
          {state?.error && <p role="alert" className="text-sm text-risk-high">{state.error}</p>}
          <Button type="submit" className="h-10 w-full rounded-full" disabled={pending}>
            <UserPlus className="size-4" /> Add contact
          </Button>
        </form>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          {telegram
            ? "Alerts go to contacts who connect on Telegram: a high-risk scan, email or call. They never include what your messages said. Text and email delivery are coming soon."
            : "Telegram isn't set up on this server yet. Add TELEGRAM_BOT_TOKEN to web/.env.local (see the README) and alerts will go to contacts who connect."}
        </p>
      </section>
    </div>
  );
}
