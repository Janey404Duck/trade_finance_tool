export default function LoginPage() {
  return (
    <main className="page">
      <form className="panel stack">
        <div>
          <h1>Login</h1>
          <p>Supabase email/password login will be wired in the auth stage.</p>
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" />
        </div>
        <button className="button" type="button">
          Sign in
        </button>
      </form>
    </main>
  );
}
