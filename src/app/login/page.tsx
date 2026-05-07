import Link from "next/link";

import { signInWithEmail } from "@/app/actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div>
          <p className="eyebrow">Golden Source CRM</p>
          <h1>Sign in to your private outreach database</h1>
          <p className="muted">Use Supabase Auth credentials for your team workspace.</p>
        </div>
        {params.error ? <p className="auth-error">{params.error}</p> : null}
        <form action={signInWithEmail} className="auth-form">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">Sign in</button>
        </form>
        <Link href="/">Back to demo dashboard</Link>
      </section>
    </main>
  );
}
