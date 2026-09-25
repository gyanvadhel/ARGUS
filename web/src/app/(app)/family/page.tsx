import { ContactsManager, type AlertRow, type Contact } from "@/components/app/contacts-manager";
import { PageHeader } from "@/components/app/page-header";
import { createClient } from "@/lib/supabase/server";
import { telegramToken } from "@/lib/telegram";

export default async function FamilyPage() {
  const supabase = await createClient();
  const [{ data: contacts }, { data: alerts }] = await Promise.all([
    supabase.from("trusted_contacts").select("id,name,email,phone,notify_high_risk,telegram_name,telegram_chat_id").order("created_at"),
    supabase
      .from("family_alerts")
      .select("id,kind,subject,score,status,created_at,trusted_contacts(name)")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);
  const telegram = Boolean(telegramToken());
  return (
    <>
      <PageHeader
        eyebrow="Family"
        title="Protect the people you love"
        subtitle={
          telegram
            ? "Trusted contacts who connect on Telegram hear from Argus the moment something high-risk reaches you."
            : "Choose who should hear when something high-risk reaches you. Alerts go out once Telegram is set up on this server."
        }
      />
      <ContactsManager
        contacts={(contacts ?? []).map(
          (c): Contact => ({
            id: c.id,
            name: c.name,
            email: c.email,
            phone: c.phone,
            notify_high_risk: c.notify_high_risk,
            telegram_name: c.telegram_name,
            telegram: c.telegram_chat_id != null, // the chat id itself never leaves the server
          }),
        )}
        alerts={(alerts ?? []) as unknown as AlertRow[]}
        telegram={telegram}
      />
    </>
  );
}

// Scans visit sites and ask several sources, so give them time on serverless hosting.
export const maxDuration = 60;
