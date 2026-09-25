import Link from "next/link";
import { WatchingEye } from "@/components/eye/watching-eye";
import { Magnetic } from "@/components/fx/magnetic";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Cta() {
  return (
    <section className="px-6 pb-28 pt-10 sm:px-10">
      <div className="mx-auto flex max-w-[1600px] flex-col items-center border-t border-border/70 pt-28 text-center">
        <WatchingEye className="h-12 w-20 text-foreground" strokeWidth={1.4} />
        <h2 className="font-display mt-10 text-[clamp(3.8rem,12vw,13rem)]">
          Something
          <br />
          feel off?
        </h2>
        <p className="mt-8 max-w-md text-lg text-muted-foreground">Paste it into Argus. You&apos;ll know in seconds.</p>
        <Magnetic className="mt-12">
          <Link href="/signup" className={cn(buttonVariants(), "h-14 rounded-full px-10 text-base")}>
            Create free account
          </Link>
        </Magnetic>
      </div>
    </section>
  );
}
