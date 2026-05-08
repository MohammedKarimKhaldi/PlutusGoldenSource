import Link from "next/link";

import { signInWithEmail } from "@/app/actions";
import { SignInSubmitButton } from "@/app/login/sign-in-submit-button";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const errorMessage = loginErrorMessage(params.error);

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div>
          <p className="eyebrow">Golden Source CRM</p>
          <h1>Sign in to your private outreach database</h1>
          <p className="muted">Use Supabase Auth credentials for your team workspace.</p>
        </div>
        {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
        <form action={signInWithEmail} className="auth-form">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <SignInSubmitButton />
        </form>
        <Link href="/">Back to demo dashboard</Link>
      </section>
    </main>
  );
}

function loginErrorMessage(error?: string) {
  switch (error) {
    case "auth_unavailable":
      return "Authentication is not configured on this deployment.";
    case "invalid_credentials":
      return "Email or password is incorrect.";
    case undefined:
      return null;
    default:
      return "Sign in failed. Please try again.";
  }
}
