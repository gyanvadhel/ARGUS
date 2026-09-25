import { PageHeader } from "@/components/app/page-header";
import { ScanConsole } from "@/components/app/scan-console";

export default function ScanPage() {
  return (
    <>
      <PageHeader
        eyebrow="Scan"
        title="Scan anything"
        subtitle="Links, emails, texts, phone numbers and files, checked against real threat intelligence in seconds."
      />
      <ScanConsole />
    </>
  );
}
