import { InstallHint } from "@/components/app/install-hint";
import { PageHeader } from "@/components/app/page-header";
import { ScanConsole } from "@/components/app/scan-console";

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ input?: string; run?: string; shared?: string }>;
}) {
  const { input, run, shared } = await searchParams;
  return (
    <>
      <PageHeader
        eyebrow="Scan"
        title="Scan anything"
        subtitle="Links, emails, texts, phone numbers, files, screenshots and QR codes, checked against real threat intelligence in seconds."
      />
      <div className="space-y-8">
        <ScanConsole initialInput={input?.slice(0, 2000)} autoRun={run === "1"} shared={shared} />
        <InstallHint />
      </div>
    </>
  );
}

// Scans visit sites and ask several sources, so give them time on serverless hosting.
export const maxDuration = 60;
