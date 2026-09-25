import { CallerIdConsole } from "@/components/app/caller-id-console";
import { PageHeader } from "@/components/app/page-header";
import { createClient } from "@/lib/supabase/server";

export default async function CallerIdPage() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("trusted_contacts")
    .select("id", { count: "exact", head: true })
    .eq("notify_high_risk", true);
  return (
    <>
      <PageHeader
        eyebrow="Caller ID"
        title="Who's calling?"
        subtitle="Look up any number. Argus checks whether it's real, whether it's a callback trap, what other users reported, and whether it has turned up in scam messages."
      />
      <CallerIdConsole contacts={count ?? 0} />
    </>
  );
}
