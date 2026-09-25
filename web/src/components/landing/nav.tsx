import Link from "next/link";
import { WatchingEye } from "@/components/eye/watching-eye";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Nav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 bg-linear-to-b from-background/90 to-transparent">
      <div className="mx-auto flex h-20 max-w-[1600px] items-center justify-between px-6 sm:px-10">
        <Link href="/" className="flex items-center gap-3 text-foreground">
          <WatchingEye className="h-5 w-8 text-foreground" strokeWidth={1.6} />
          <span className="font-display text-2xl">Argus</span>
        </Link>
        <nav className="hidden items-center gap-9 text-sm text-foreground/80 md:flex">
          <a href="#eyes" className="hover:text-foreground">How it sees</a>
          <a href="#watches" className="hover:text-foreground">What it watches</a>
          <a href="#next" className="hover:text-foreground">Coming next</a>
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <Link href="/dashboard" className={cn(buttonVariants(), "h-10 rounded-full px-5")}>Open dashboard</Link>
          ) : (
            <>
              <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }), "h-10 px-4 text-foreground")}>Sign in</Link>
              <Link href="/signup" className={cn(buttonVariants(), "h-10 rounded-full px-5")}>Create account</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
