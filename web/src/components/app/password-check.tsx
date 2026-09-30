"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pwnedCount } from "@/lib/pwned";

type State = { status: "idle" | "checking" | "error" } | { status: "done"; count: number };

/** Has a password leaked? Checked against Have I Been Pwned without the password leaving the device (lib/pwned.ts). */
export function PasswordCheck({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [state, setState] = useState<State>({ status: "idle" });

  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setState({ status: "checking" });
    try {
      setState({ status: "done", count: await pwnedCount(password) });
    } catch {
      setState({ status: "error" });
    }
  }

  return (
    <section className="glass rounded-3xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 font-medium">
          <KeyRound className="size-4 text-muted-foreground" /> Has a password leaked?
        </h2>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:bg-white/5" aria-label="Close password check">
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Your password never leaves this device. Argus sends only the first 5 characters of its scrambled fingerprint to
        Have I Been Pwned, and compares the matches it sends back right here.
      </p>
      <form onSubmit={check} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Input
            type={shown ? "text" : "password"}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setState({ status: "idle" }); }}
            autoComplete="off"
            spellCheck={false}
            aria-label="Password to check"
            placeholder="Type a password"
            className="h-10 pr-10"
          />
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={shown ? "Hide password" : "Show password"}
          >
            {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <Button type="submit" disabled={!password || state.status === "checking"} className="h-10 rounded-full px-6">
          {state.status === "checking" && <Loader2 className="size-4 animate-spin" />}
          Check password
        </Button>
      </form>
      <div aria-live="polite">
        {state.status === "done" && state.count > 0 && (
          <div className="mt-4 rounded-2xl border border-risk-high/30 bg-risk-high/10 p-4 text-sm leading-relaxed text-risk-high">
            <p className="font-medium">Seen {state.count.toLocaleString()} time{state.count === 1 ? "" : "s"} in data breaches.</p>
            <p className="mt-1">
              Criminals try leaked passwords on every site. Change it everywhere you use it, and turn on two-step
              verification where you can.
            </p>
          </div>
        )}
        {state.status === "done" && state.count === 0 && (
          <div className="mt-4 rounded-2xl border border-border/70 p-4 text-sm leading-relaxed">
            <p className="font-medium">Not found in any known data breach.</p>
            <p className="mt-1 text-muted-foreground">
              That doesn&apos;t make it strong. Use a long, different password for every account; a password manager makes
              that easy.
            </p>
          </div>
        )}
        {state.status === "error" && (
          <p className="mt-4 text-sm text-risk-high">Couldn&apos;t reach Have I Been Pwned. Check your connection and try again.</p>
        )}
      </div>
    </section>
  );
}
