export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <div className="page-shell">
      <p className="eyebrow">ADMIN</p>
      <h1>Execution access</h1>
      <p className="muted">Use the existing CRON_SECRET as the admin password. It is checked server-side and never stored in the browser.</p>
      <form className="panel" style={{ marginTop: 24, maxWidth: 560 }} action="/api/admin/login" method="post">
        <label htmlFor="password"><strong>Password</strong></label>
        <input id="password" name="password" type="password" required autoComplete="current-password" style={{ width: "100%", marginTop: 8, padding: 12 }} />
        {params.error && <p style={{ color: "crimson" }}>Incorrect password.</p>}
        <button type="submit" style={{ marginTop: 16, padding: "10px 16px" }}>Sign in</button>
      </form>
    </div>
  );
}
