"use client";

import { useActionState, useEffect, useRef } from "react";
import { BellOff, BellRing, Trash2, UserPlus } from "lucide-react";
import { addContact, deleteContact, toggleAlerts } from "@/app/(app)/family/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type Contact = { id: string; name: string; email: string | null; phone: string | null; notify_high_risk: boolean };

export function ContactsManager({ contacts }: { contacts: Contact[] }) {
  const [state, action, pending] = useActionState(addContact, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <section className="glass rounded-3xl p-6">
        <h2 className="font-serif text-2xl">Trusted contacts</h2>
        {contacts.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">No one yet. Add a family member who should hear about high-risk scams.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border/60">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center gap-4 py-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-aurora-1/40 to-aurora-3/30 font-serif text-lg">
                  {c.name[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(", ")}</p>
                </div>
                <form action={toggleAlerts}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="value" value={String(!c.notify_high_risk)} />
                  <Button variant="ghost" type="submit" className="size-9" aria-label={c.notify_high_risk ? `Turn off alerts for ${c.name}` : `Turn on alerts for ${c.name}`}>
                    {c.notify_high_risk ? <BellRing className="size-4 text-aurora-2" /> : <BellOff className="size-4 text-muted-foreground" />}
                  </Button>
                </form>
                <form action={deleteContact}>
                  <input type="hidden" name="id" value={c.id} />
                  <Button variant="ghost" type="submit" className="size-9" aria-label={`Remove ${c.name}`}>
                    <Trash2 className="size-4" />
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="glass h-fit rounded-3xl p-6">
        <h2 className="font-serif text-2xl">Add someone</h2>
        <form ref={formRef} action={action} className="mt-4 space-y-3">
          <Input name="name" placeholder="Name" aria-label="Name" required maxLength={100} className="h-10" />
          <Input name="email" type="email" placeholder="Email" aria-label="Email" maxLength={254} className="h-10" />
          <Input name="phone" placeholder="Phone" aria-label="Phone" maxLength={32} className="h-10" />
          {state?.error && <p role="alert" className="text-sm text-risk-high">{state.error}</p>}
          <Button type="submit" className="h-10 w-full rounded-full" disabled={pending}>
            <UserPlus className="size-4" /> Add contact
          </Button>
        </form>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Alerts are <span className="text-foreground">simulated</span> in this version. Real text and email delivery is on the roadmap.
        </p>
      </section>
    </div>
  );
}
