import Link from "next/link";
import { Iris } from "@/components/iris/iris";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Hero() {
  return (
    <section className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 pb-24 pt-14 lg:grid-cols-[1.05fr_1fr] lg:pb-32 lg:pt-20">
      <div className="min-w-0">
        <h1 className="font-serif text-5xl leading-[0.92] tracking-tight sm:text-7xl xl:text-[6.5rem]">
          The watcher that never sleeps.
        </h1>
        <p className="mt-8 max-w-[34rem] text-lg leading-relaxed text-muted-foreground">
          Paste a link, an email, a text or a phone number, or drop a file. Argus checks it against real threat
          intelligence and tells you, in plain words, whether it&apos;s safe.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link href="/signup" className={cn(buttonVariants(), "h-12 rounded-full px-7 text-base")}>
            Create free account
          </Link>
          <a href="#how" className={cn(buttonVariants({ variant: "ghost" }), "h-12 rounded-full px-6 text-base")}>
            See how a verdict is made
          </a>
        </div>
        <p className="mt-12 max-w-[34rem] border-t border-border/60 pt-6 text-sm leading-relaxed text-muted-foreground">
          Every scan is checked against VirusTotal&apos;s 70+ antivirus engines, URLhaus, MalwareBazaar, Google Safe
          Browsing and public domain records, plus Argus&apos;s own scam-detection model.
        </p>
      </div>
      <div className="relative mx-auto w-full min-w-0 max-w-[560px]">
        <div className="absolute inset-12 rounded-full bg-aurora-2/20 blur-3xl" aria-hidden />
        <Iris size={560} className="relative h-auto w-full" />
      </div>
    </section>
  );
}
