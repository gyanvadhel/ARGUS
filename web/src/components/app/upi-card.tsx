import { QrCode, TriangleAlert, X } from "lucide-react";
import type { QrPayload } from "@/lib/qr";

type Upi = Extract<QrPayload, { kind: "upi" }>;

function rupees(amount: string): string {
  const n = Number(amount);
  return Number.isFinite(n) ? n.toLocaleString("en-IN", { style: "currency", currency: "INR" }) : amount;
}

/** A UPI QR code, explained: Argus's engine has nothing to look up, but the one rule that stops QR scams is certain. */
export function UpiCard({ payment, onDismiss }: { payment: Upi; onDismiss: () => void }) {
  const who = payment.name ?? payment.payee;
  const rows: [string, React.ReactNode][] = [
    ["Pays", <>{who}{payment.name && <span className="block font-mono text-xs text-muted-foreground">{payment.payee}</span>}</>],
    ["Amount", payment.amount ? rupees(payment.amount) : "Not set: you'd type it in"],
    ...(payment.note ? [["Note", payment.note] as [string, React.ReactNode]] : []),
  ];
  return (
    <section className="glass relative overflow-hidden rounded-3xl p-6 sm:p-8" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <QrCode className="size-4" /> {payment.mandate ? "UPI autopay code" : "UPI payment code"}
        </p>
        <button type="button" onClick={onDismiss} className="rounded-full p-1.5 text-muted-foreground hover:bg-white/5" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <h2 className="mt-4 font-serif text-3xl sm:text-4xl">
        {payment.mandate ? "This code sets up automatic payments from your account." : "This code sends money. It never receives it."}
      </h2>
      <div className="mt-5 flex gap-3 rounded-2xl border border-risk-high/30 bg-risk-high/10 p-4 text-sm leading-relaxed text-risk-high">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          If someone sent you this for a refund, a prize, a job payment or to &ldquo;receive&rdquo; money, it&apos;s a scam.
          Don&apos;t scan it in your UPI app. You never need your PIN to receive money.
        </p>
      </div>
      <dl className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        Paying a shop or a friend? Go ahead, as long as the name your UPI app shows before you pay is the one you expect.
      </p>
    </section>
  );
}
