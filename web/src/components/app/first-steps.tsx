import Link from "next/link";
import { Globe, MessageSquareText, Phone } from "lucide-react";

// Real inputs with known real verdicts, so a new account sees Argus work before scanning anything of its own.
const EXAMPLES = [
  { label: "A phishing link", icon: Globe, input: "http://paypal-security-alert.net/verify-account" },
  {
    label: "A scam text",
    icon: MessageSquareText,
    input: "Dear customer, your KYC is pending and your bank account will be blocked today. Update now: http://sbi-kyc-update.in",
  },
  { label: "A reported robocaller", icon: Phone, input: "+1 877-556-9255" },
];

export function FirstSteps() {
  return (
    <section className="glass mb-4 rounded-3xl p-6">
      <h2 className="font-serif text-2xl">Try Argus on a real example</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Each one runs a real check, and the result lands here in your overview. Then paste anything of your own.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {EXAMPLES.map(({ label, icon: Icon, input }) => (
          <Link
            key={label}
            href={`/scan?${new URLSearchParams({ input, run: "1" })}`}
            className="inline-flex items-center gap-2 rounded-full border border-border/70 px-4 py-2 text-sm hover:border-foreground/40"
          >
            <Icon className="size-4 text-muted-foreground" /> {label}
          </Link>
        ))}
      </div>
    </section>
  );
}
