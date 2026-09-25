import { PageHeader } from "@/components/app/page-header";
import { ScanConsole } from "@/components/app/scan-console";

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ input?: string }> }) {
  const { input } = await searchParams;
  return (
    <>
      <PageHeader
        eyebrow="Scan"
        title="Scan anything"
        subtitle="Links, emails, texts, phone numbers and files, checked against real threat intelligence in seconds."
      />
      <ScanConsole initialInput={input?.slice(0, 2000)} />
    </>
  );
}

// Scans visit sites and ask several sources, so give them time on serverless hosting.
export const maxDuration = 60;
