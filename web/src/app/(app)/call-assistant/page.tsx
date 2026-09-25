import { CallConsole } from "@/components/app/call-console";
import { PageHeader } from "@/components/app/page-header";

export default function CallAssistantPage() {
  return (
    <>
      <PageHeader
        eyebrow="Call Assistant (simulation)"
        title="Let Argus pick up"
        subtitle="Play the unknown caller. Argus screens the call live, scores every sentence, and never shares a thing."
      />
      <CallConsole />
    </>
  );
}
