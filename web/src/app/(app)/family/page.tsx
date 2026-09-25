import { ContactsManager, type Contact } from "@/components/app/contacts-manager";
import { PageHeader } from "@/components/app/page-header";
import { createClient } from "@/lib/supabase/server";

export default async function FamilyPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("trusted_contacts").select("id,name,email,phone,notify_high_risk").order("created_at");
  return (
    <>
      <PageHeader
        eyebrow="Family"
        title="Protect the people you love"
        subtitle="Trusted contacts are told when something high-risk reaches you, so nobody faces a scam alone."
      />
      <ContactsManager contacts={(data ?? []) as Contact[]} />
    </>
  );
}
