import { WatchingEye } from "@/components/eye/watching-eye";

export function HundredEyes() {
  return (
    <section id="eyes" className="mx-auto grid max-w-[1600px] items-center gap-16 px-6 py-32 sm:px-10 lg:grid-cols-[1fr_1.15fr] lg:py-44">
      <div>
        <h2 className="font-display text-[clamp(3.8rem,9vw,9.5rem)]">
          A hundred
          <br />
          eyes.
        </h2>
        <p className="mt-10 max-w-md text-xl leading-relaxed text-foreground/80">
          In the myth, Argus had a hundred eyes and never closed them all at once.
        </p>
        <p className="mt-5 max-w-md leading-relaxed text-muted-foreground">
          Argus the app works the same way. Every scan asks VirusTotal&apos;s 70+ antivirus engines, URLhaus, MalwareBazaar,
          Google Safe Browsing and public domain records at the same moment, alongside its own scam model. If one source is
          slow or down, the others still answer.
        </p>
      </div>
      <div className="grid grid-cols-6 gap-x-4 gap-y-6 sm:grid-cols-10 max-sm:[&>*:nth-child(n+49)]:hidden">
        {Array.from({ length: 100 }, (_, i) => (
          <WatchingEye key={i} className="h-auto w-full" />
        ))}
      </div>
    </section>
  );
}
