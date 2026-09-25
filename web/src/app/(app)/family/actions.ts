"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ContactState = { error?: string; ok?: boolean } | undefined;

export async function addContact(_: ContactState, formData: FormData): Promise<ContactState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  if (!name) return { error: "Add a name." };
  if (!email && !phone) return { error: "Add an email or a phone number." };
  if (name.length > 100 || (email && email.length > 254) || (phone && phone.length > 32)) return { error: "That's a bit long." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Please sign in again." };
  const { error } = await supabase.from("trusted_contacts").insert({ name, email, phone });
  if (error) return { error: error.message };
  revalidatePath("/family");
  return { ok: true };
}

export async function deleteContact(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("trusted_contacts").delete().eq("id", String(formData.get("id")));
  revalidatePath("/family");
}

export async function toggleAlerts(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("trusted_contacts")
    .update({ notify_high_risk: formData.get("value") === "true" })
    .eq("id", String(formData.get("id")));
  revalidatePath("/family");
}
