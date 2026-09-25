import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <Logo className="size-8" />
          <span className="font-serif text-3xl">Argus</span>
        </Link>
        <div className="glass rounded-3xl p-8 sm:p-10">{children}</div>
      </div>
    </div>
  );
}
