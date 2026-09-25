import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Cta() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-24">
      <div className="glass relative overflow-hidden rounded-[2rem] px-8 py-16 text-center sm:px-16">
        <div className="absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-aurora-1/25 blur-3xl" aria-hidden />
        <h2 className="relative font-serif text-5xl tracking-tight sm:text-6xl">Something feel off?</h2>
        <p className="relative mx-auto mt-4 max-w-xl text-muted-foreground">Paste it into Argus. You&apos;ll know in seconds.</p>
        <Link href="/signup" className={cn(buttonVariants(), "relative mt-9 h-12 rounded-full px-8 text-base")}>
          Create free account
        </Link>
      </div>
    </section>
  );
}
