"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, LayoutDashboard, LogOut, Mail, PhoneIncoming, ScanSearch, Users } from "lucide-react";
import { WatchingEye } from "@/components/eye/watching-eye";
import { signOut } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/scan", label: "Scan", icon: ScanSearch },
  { href: "/caller-id", label: "Caller ID", icon: PhoneIncoming },
  { href: "/inbox", label: "Inbox", icon: Mail },
  { href: "/history", label: "History", icon: History },
  { href: "/family", label: "Family", icon: Users },
];

function useActive() {
  const path = usePathname();
  return (href: string) => path === href || path.startsWith(href + "/");
}

export function Sidebar({ name, email }: { name: string; email: string }) {
  const isActive = useActive();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border/60 bg-background/40 px-4 py-6 backdrop-blur-xl md:flex">
      <Link href="/" className="flex items-center gap-3 px-2">
        <WatchingEye logo className="h-5 w-8 text-foreground" strokeWidth={1.6} />
        <span className="font-display text-2xl">Argus</span>
      </Link>
      <nav className="mt-10 flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground",
              isActive(href) && "bg-white/[0.06] text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto rounded-2xl border border-border/60 p-3">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{email}</p>
        <form action={signOut}>
          <button className="mt-3 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <LogOut className="size-3.5" /> Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

/** Phones: the account row scrolls away, the six tabs stay pinned and always fit the screen width. */
export function MobileNav({ email }: { email: string }) {
  const isActive = useActive();
  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 pt-3 md:hidden">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <WatchingEye logo className="h-4 w-7 text-foreground" strokeWidth={1.6} />
          <span className="font-display text-xl">Argus</span>
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <span className="min-w-0 truncate text-xs text-muted-foreground">{email}</span>
          <form action={signOut} className="shrink-0">
            <button className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              <LogOut className="size-3.5" /> Sign out
            </button>
          </form>
        </div>
      </div>
      <nav className="sticky top-0 z-20 mt-2 grid grid-cols-6 border-b border-border/60 bg-background/70 px-1 py-1.5 backdrop-blur-xl md:hidden">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex min-w-0 flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] text-muted-foreground",
              isActive(href) && "bg-white/[0.07] text-foreground",
            )}
          >
            <Icon className="size-4" />
            <span className="max-w-full truncate">{label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
