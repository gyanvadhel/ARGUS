import type { Metadata } from "next";
import Link from "next/link";
import { WatchingEye } from "@/components/eye/watching-eye";
import { buttonVariants } from "@/components/ui/button";
import { latestAndroidRelease, type AndroidRelease } from "@/lib/app-release";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Argus for Android",
  description: "Check links, messages, numbers, QR codes and screenshots for scams, right from your phone. Free.",
};
export const revalidate = 3600;

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="font-display text-2xl text-muted-foreground">{n}</span>
      <p className="leading-relaxed text-foreground/85">{children}</p>
    </li>
  );
}

export default async function AppPage() {
  const release: AndroidRelease | null = await latestAndroidRelease().catch(() => null);
  const published = release?.publishedAt
    ? new Date(release.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-14 sm:py-20">
      <Link href="/" className="inline-flex items-center gap-3">
        <WatchingEye logo className="h-5 w-8 text-foreground" strokeWidth={1.6} />
        <span className="font-display text-2xl">Argus</span>
      </Link>
      <h1 className="font-display mt-12 text-[clamp(2.6rem,8vw,4.5rem)]">Argus for Android</h1>
      <p className="mt-6 text-lg leading-relaxed text-foreground/85">
        Check links, messages, phone numbers, QR codes and screenshots for scams, right from your phone. Share anything
        to Argus from another app. Free, and it never says &ldquo;Safe&rdquo; without proof.
      </p>
      <p className="mt-4 leading-relaxed text-foreground/85">
        Turn on call warnings and Argus warns you while an unknown number is calling, if it looks like a scam (Android
        10 or newer).
      </p>

      {release ? (
        <div className="mt-10">
          <a href={release.apk} className={cn(buttonVariants(), "h-12 rounded-full px-7 text-base")}>
            Download Argus {release.version}
          </a>
          <p className="mt-3 text-sm text-muted-foreground">
            {published ? `Released ${published}. ` : ""}Needs Android 8 or newer.
          </p>
        </div>
      ) : (
        <p className="mt-10 rounded-2xl border border-border/70 p-5 text-foreground/80">
          The first version is almost ready. Check back soon.
        </p>
      )}

      <section className="mt-14">
        <h2 className="font-serif text-2xl">Installing it</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Argus isn&apos;t on the Play Store yet, so Android asks a couple of extra questions the first time.
        </p>
        <ol className="mt-6 space-y-5">
          <Step n={1}>Tap <strong>Download</strong> on your phone.</Step>
          <Step n={2}>Open the downloaded file. If Android asks, allow your browser to install apps (&ldquo;Allow from this source&rdquo;), then go back.</Step>
          <Step n={3}>
            Tap <strong>Install</strong>. Play Protect may say it doesn&apos;t recognise the developer, because Argus isn&apos;t
            on the Play Store yet. Tap <strong>More details</strong>, then <strong>Install anyway</strong>.
          </Step>
          <Step n={4}>Open Argus. Sign in with the same account as this website, or skip and try it first.</Step>
        </ol>
      </section>

      <section className="mt-14">
        <h2 className="font-serif text-2xl">Coming next</h2>
        <p className="mt-3 leading-relaxed text-foreground/80">
          A scam-site blocker for every app and family alerts on your phone.
          The app tells you when an update is ready.
        </p>
      </section>

      <p className="mt-14 text-sm text-muted-foreground">
        What the app does with your data: see the <Link href="/privacy" className="text-foreground underline underline-offset-4">privacy policy</Link>.
      </p>
    </main>
  );
}
