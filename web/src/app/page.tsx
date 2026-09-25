import { Cursor } from "@/components/fx/cursor";
import { Channels } from "@/components/landing/channels";
import { Cta } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { HundredEyes } from "@/components/landing/hundred-eyes";
import { Nav } from "@/components/landing/nav";
import { Roadmap } from "@/components/landing/roadmap";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <>
      <Cursor />
      <Nav signedIn={!!user} />
      <main>
        <Hero />
        <HundredEyes />
        <Channels />
        <HowItWorks />
        <Roadmap />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
