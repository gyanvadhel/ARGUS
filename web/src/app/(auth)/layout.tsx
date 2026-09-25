import Link from "next/link";
import { WatchingEye } from "@/components/eye/watching-eye";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-10 flex items-center justify-center gap-3">
          <WatchingEye className="h-7 w-11 text-foreground" strokeWidth={1.5} />
          <span className="font-display text-4xl">Argus</span>
        </Link>
        <div className="glass rounded-3xl p-8 sm:p-10">{children}</div>
      </div>
    </div>
  );
}
