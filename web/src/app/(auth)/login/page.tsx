import { AuthForm } from "@/components/auth/auth-form";
import { loginNotice } from "@/lib/auth-flow";
import { cn } from "@/lib/utils";
import { signIn } from "../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const notice = loginNotice(new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])));
  return (
    <>
      <h1 className="font-serif text-4xl">Welcome back</h1>
      <p className="mt-2 text-muted-foreground">Sign in to your Argus dashboard.</p>
      {notice && (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={cn(
            "mt-6 rounded-lg border px-3 py-2 text-sm",
            notice.tone === "error" ? "border-risk-high/30 bg-risk-high/10 text-risk-high" : "border-border bg-white/4 text-foreground",
          )}
        >
          {notice.text}
        </p>
      )}
      <div className="mt-8">
        <AuthForm mode="login" action={signIn} next={params.next} />
      </div>
    </>
  );
}
