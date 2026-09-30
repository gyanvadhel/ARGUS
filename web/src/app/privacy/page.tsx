import type { Metadata } from "next";
import Link from "next/link";
import { WatchingEye } from "@/components/eye/watching-eye";

export const metadata: Metadata = { title: "Argus privacy policy" };

// Set NEXT_PUBLIC_SUPPORT_EMAIL to the support address shown on Argus's Google sign-in screen.
const SUPPORT = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-serif text-2xl">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-foreground/80">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-14 sm:py-20">
      <Link href="/" className="inline-flex items-center gap-3">
        <WatchingEye logo className="h-5 w-8 text-foreground" strokeWidth={1.6} />
        <span className="font-display text-2xl">Argus</span>
      </Link>
      <h1 className="font-display mt-12 text-[clamp(2.6rem,8vw,4.5rem)]">Privacy policy</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated 27 September 2026</p>
      <p className="mt-8 text-lg leading-relaxed text-foreground/85">
        Argus checks links, emails, texts, phone numbers and files for scams. This page says exactly what it keeps, who
        else sees anything, and how to remove it. Argus doesn&apos;t sell data or show ads.
      </p>

      <Section title="Your account">
        <p>
          When you sign up, Argus keeps your name and email address, and your password in scrambled (hashed) form. If you
          sign in with Google, Google shares only your name, email address and profile picture.
        </p>
      </Section>

      <Section title="What you check">
        <p>
          Whatever you check is sent to Argus&apos;s scanning engine, which answers and doesn&apos;t keep it afterwards.
          When you&apos;re signed in, your history keeps a short preview (up to 200 characters) and the verdict, including
          the evidence behind it, such as the links found in a message. Delete any scan from your History page.
        </p>
        <p>
          To check a link, Argus visits the page from its own server, never from your device, and may look the link up
          on VirusTotal. Files are inspected on Argus&apos;s server; only the file&apos;s fingerprint (a hash), never the
          file itself, is looked up on VirusTotal. Numbers you look up in Caller ID may be checked against
          IPQualityScore&apos;s spam and fraud reports, and US and Canadian numbers against the FCC&apos;s public
          complaint records.
        </p>
        <p>
          The quick check on the home page needs no account and saves nothing. To stop it being overused, Argus counts
          checks under a scrambled code made from your internet address, never the address itself, and deletes the count
          within a day.
        </p>
      </Section>

      <Section title="What other Argus users see">
        <p>
          If you report a phone number, the number, the kind of call and any name or note you add are shown to other
          signed-in users, without your name. Phone numbers found in high-risk messages you check are counted the same
          way, as &ldquo;seen in scam messages&rdquo;. Nothing else you check is shared.
        </p>
      </Section>

      <Section title="Gmail">
        <p>
          If you connect Gmail, Argus gets read-only access: it can never send, delete or change anything. Each time you
          open the Inbox page, it reads your 12 latest emails (inbox or spam) and checks them. It keeps each email&apos;s
          subject and sender with the verdict in your history. The key Google issues for this is stored encrypted.
          Disconnecting removes it and revokes Argus&apos;s access at Google.
        </p>
        <p>
          Argus&apos;s use of information received from Google APIs adheres to the Google API Services User Data Policy,
          including the Limited Use requirements. Your Gmail data is used only to check your emails for you, is never
          used for ads, and is never read by people.
        </p>
      </Section>

      <Section title="Family alerts">
        <p>
          Contacts you add are kept with the name you give them. If a contact connects on Telegram, Argus keeps their
          Telegram chat ID so it can message them. Alerts say what kind of thing was risky and how risky, never what a
          message or email said.
        </p>
      </Section>

      <Section title="Services Argus relies on">
        <p>
          Supabase stores accounts and history. Vercel hosts the website and counts visits without cookies (Vercel
          Analytics). Render runs the scanning engine. Argus also asks VirusTotal, IPQualityScore (for phone numbers), Google (for Gmail and Google sign-in),
          Telegram (for family alerts), the FCC&apos;s open data, and public threat lists (URLhaus, OpenPhish,
          Phishing.Database) as described above.
        </p>
      </Section>

      <Section title="Removing your data">
        <p>
          Delete scans from History, remove family contacts on the Family page, and disconnect Gmail on the Inbox page at
          any time. To delete your whole account and everything in it,{" "}
          {SUPPORT ? (
            <>
              email{" "}
              <a href={`mailto:${SUPPORT}`} className="text-foreground underline underline-offset-4">
                {SUPPORT}
              </a>
            </>
          ) : (
            "email the support address shown on Argus's Google sign-in screen"
          )}{" "}
          from the address you signed up with.
        </p>
      </Section>
    </main>
  );
}
