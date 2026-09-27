import { PasswordForm } from "@/components/auth/password-form";
import { updatePassword } from "../actions";

// Reached from a reset link: /auth/confirm has already signed you in, and proxy.ts sends anyone else to sign in.
export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="font-serif text-4xl">Choose a new password</h1>
      <p className="mt-2 text-muted-foreground">You&apos;ll stay signed in on this device.</p>
      <div className="mt-8">
        <PasswordForm mode="update" action={updatePassword} />
      </div>
    </>
  );
}
