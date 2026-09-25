import { AuthForm } from "@/components/auth/auth-form";
import { signIn } from "../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="font-serif text-4xl">Welcome back</h1>
      <p className="mt-2 text-muted-foreground">Sign in to your Argus dashboard.</p>
      <div className="mt-8">
        <AuthForm mode="login" action={signIn} next={next} />
      </div>
    </>
  );
}
