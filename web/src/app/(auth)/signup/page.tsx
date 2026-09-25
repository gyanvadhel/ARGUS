import { AuthForm } from "@/components/auth/auth-form";
import { signUp } from "../actions";

export default function SignupPage() {
  return (
    <>
      <h1 className="font-serif text-4xl">Create your watch</h1>
      <p className="mt-2 text-muted-foreground">Free, private, and ready in seconds.</p>
      <div className="mt-8">
        <AuthForm mode="signup" action={signUp} />
      </div>
    </>
  );
}
