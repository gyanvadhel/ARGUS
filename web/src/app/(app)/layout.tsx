import { redirect } from "next/navigation";
import { MobileNav, Sidebar } from "@/components/app/sidebar";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const name = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "You";
  return (
    <div className="flex min-h-dvh">
      <Sidebar name={name} email={user.email ?? ""} />
      <div className="min-w-0 flex-1">
        <MobileNav />
        <main className="mx-auto max-w-6xl px-5 py-8 lg:px-10 lg:py-12">{children}</main>
      </div>
    </div>
  );
}
