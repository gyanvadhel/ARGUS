import type { Metadata } from "next";
import Link from "next/link";
import { WatchingEye } from "@/components/eye/watching-eye";
import { buttonVariants } from "@/components/ui/button";
import { inviteInfo } from "@/lib/family-invite-info";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { JoinButton } from "./join-button";

export const metadata: Metadata = { title: "Join a family on Argus", robots: { index: false } };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const info = await inviteInfo(code);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const who = info.name ?? "Someone";

  return (
    <main className="mx-auto max-w-xl px-6 py-14 sm:py-20">
      <Link href="/" className="inline-flex items-center gap-3">
        <WatchingEye logo className="h-5 w-8 text-foreground" strokeWidth={1.6} />
        <span className="font-display text-2xl">Argus</span>
      </Link>
      {info.valid ? (
        <>
          <h1 className="font-display mt-12 text-[clamp(2.2rem,7vw,3.6rem)] leading-tight">{who} invited you to their family on Argus</h1>
          <p className="mt-6 leading-relaxed text-foreground/80">
            Joining links your two Argus accounts. In the Argus app, family members will be able to see that Argus is
            protecting each other, and hear when it warns about a likely scam (coming soon). What your messages say and
            which sites you visit are never shared.
          </p>
          {user ? (
            <JoinButton code={code} />
          ) : (
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/login?next=${encodeURIComponent(`/app/join/${code}`)}`} className={cn(buttonVariants(), "h-11 rounded-full px-6")}>
                Sign in to join
              </Link>
              <Link href="/signup" className={cn(buttonVariants({ variant: "outline" }), "h-11 rounded-full px-6")}>
                Create a free account
              </Link>
            </div>
          )}
        </>
      ) : (
        <>
          <h1 className="font-display mt-12 text-[clamp(2.2rem,7vw,3.6rem)] leading-tight">This invite doesn&apos;t work anymore</h1>
          <p className="mt-6 leading-relaxed text-foreground/80">It has expired or was already used. Ask for a new one.</p>
        </>
      )}
      <p className="mt-12 text-sm text-muted-foreground">
        On Android? <Link href="/app" className="text-foreground underline underline-offset-4">Get the Argus app</Link>.
      </p>
    </main>
  );
}
