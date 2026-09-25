import { Mail } from "lucide-react";
import { InboxConsole } from "@/components/app/inbox-console";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { googleCreds } from "@/lib/gmail";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const ERRORS: Record<string, string> = {
  "not-configured": "Gmail isn't set up on this Argus server yet.",
  denied: "Google sign-in was cancelled, so nothing was connected.",
  state: "That sign-in link expired or didn't start here. Try connecting again.",
  google: "Google didn't finish the sign-in. Try connecting again.",
  save: "Google signed you in, but Argus couldn't save the connection. Try connecting again.",
};

function SetupNeeded() {
  return (
    <section className="glass max-w-3xl rounded-3xl p-8">
      <h2 className="font-serif text-3xl">Gmail isn&apos;t set up on this server yet</h2>
      <p className="mt-3 text-muted-foreground">
        Connecting Gmail needs a Google sign-in app that belongs to whoever runs this Argus server. It takes about ten
        minutes, once:
      </p>
      <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground/85">
        <li>In Google Cloud Console, create a project and enable the Gmail API.</li>
        <li>Set up the OAuth consent screen (External) and add your Gmail address as a test user.</li>
        <li>
          Create an OAuth client of type Web application with the redirect URI{" "}
          <code className="font-mono text-xs">http://localhost:3000/api/gmail/callback</code>.
        </li>
        <li>
          Paste its client ID and secret into <code className="font-mono text-xs">web/.env.local</code> as GOOGLE_CLIENT_ID
          and GOOGLE_CLIENT_SECRET, then restart the web app.
        </li>
      </ol>
      <p className="mt-5 text-sm text-muted-foreground">The README has the same steps with every setting spelled out.</p>
    </section>
  );
}

function ConnectCard() {
  return (
    <section className="glass max-w-3xl rounded-3xl p-8">
      <Mail className="size-6 text-muted-foreground" />
      <h2 className="mt-4 font-serif text-3xl">Let Argus read your latest emails</h2>
      <ul className="mt-4 space-y-2 text-sm leading-relaxed text-foreground/85">
        <li>Read-only: Argus can read your mail but can never send, delete or change anything.</li>
        <li>Each time you open this page, your 12 latest inbox emails are checked for spoofed senders, phishing and dangerous links.</li>
        <li>Only the verdicts are kept, in your history, with each email&apos;s subject and sender. Disconnect any time.</li>
      </ul>
      {/* a plain link, not next/link: this route hands you over to Google */}
      <a href="/api/gmail/connect" className={cn(buttonVariants(), "mt-7 h-11 rounded-full px-6")}>
        Connect Gmail
      </a>
    </section>
  );
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const { error, connected } = await searchParams;
  const creds = googleCreds();
  const supabase = await createClient();
  const { data: connection } = creds
    ? await supabase.from("mail_connections").select("email").maybeSingle()
    : { data: null };

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Your inbox, watched"
        subtitle="Connect Gmail and Argus checks your latest emails for spoofed senders, phishing and dangerous links."
      />
      {error && ERRORS[error] && (
        <p role="alert" className="mb-6 max-w-3xl rounded-2xl border border-risk-high/30 bg-risk-high/10 px-4 py-3 text-sm text-risk-high">
          {ERRORS[error]}
        </p>
      )}
      {!creds ? <SetupNeeded /> : connection ? <InboxConsole email={connection.email} justConnected={connected === "1"} /> : <ConnectCard />}
    </>
  );
}
