import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Nav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/40 bg-background/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="font-serif text-2xl">Argus</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#channels" className="hover:text-foreground">What it checks</a>
          <a href="#how" className="hover:text-foreground">How a verdict is made</a>
          <a href="#roadmap" className="hover:text-foreground">Roadmap</a>
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <Link href="/dashboard" className={cn(buttonVariants(), "h-9 rounded-full px-4")}>Open dashboard</Link>
          ) : (
            <>
              <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }), "h-9 px-3")}>Sign in</Link>
              <Link href="/signup" className={cn(buttonVariants(), "h-9 rounded-full px-4")}>Create account</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
