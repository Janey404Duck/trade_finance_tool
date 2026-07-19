import { signIn } from './actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="login-shell">
      <form action={signIn} className="card login-card stack">
        <div>
          <p className="eyebrow">Trade finance workspace</p>
          <h1>Sign in</h1>
          <p>Access scenario comparison and quotation configuration.</p>
        </div>
        {error && <div className="alert" role="alert">{error}</div>}
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="button" type="submit">Sign in</button>
      </form>
    </main>
  );
}
