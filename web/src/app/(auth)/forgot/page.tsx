import { PasswordForm } from "@/components/auth/password-form";
import { loginNotice } from "@/lib/auth-flow";
import { requestPasswordReset } from "../actions";

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const notice = error ? loginNotice(new URLSearchParams({ error })) : null;
  return (
    <>
      <h1 className="font-serif text-4xl">Reset your password</h1>
      <p className="mt-2 text-muted-foreground">We&apos;ll email you a link to choose a new one.</p>
      {notice && (
        <p role="alert" className="mt-6 rounded-lg border border-risk-high/30 bg-risk-high/10 px-3 py-2 text-sm text-risk-high">
          {notice.text}
        </p>
      )}
      <div className="mt-8">
        <PasswordForm mode="request" action={requestPasswordReset} />
      </div>
    </>
  );
}
