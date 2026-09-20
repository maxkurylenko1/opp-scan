import Link from "next/link";
import { isAdminSession } from "@/lib/auth/admin";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const admin = await isAdminSession();

  if (admin) {
    return (
      <div className="page-shell">
        <div className="section-heading">
          <div><p className="eyebrow">ADMIN</p><h1>Radar control center</h1></div>
          <form action="/api/admin/logout" method="post"><button type="submit">Log out</button></form>
        </div>
        <div className="card-grid">
          <Link className="card" href="/admin/scans"><p className="eyebrow">SCANS</p><h3>Run Radar & browse history</h3><p className="muted">Launch a full scan manually and inspect each dated snapshot separately.</p></Link>
          <Link className="card" href="/execution"><p className="eyebrow">VALIDATION</p><h3>Execution CRM</h3><p className="muted">Prospects, outreach drafts, replies, paid pilots and verdicts.</p></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <p className="eyebrow">ADMIN</p>
      <h1>Admin access</h1>
      <p className="muted">Use the existing CRON_SECRET as the admin password. It is checked server-side and never stored in browser-readable storage.</p>
      <form className="panel" style={{ marginTop: 24, maxWidth: 560 }} action="/api/admin/login" method="post">
        <label htmlFor="password"><strong>Password</strong></label>
        <input id="password" name="password" type="password" required autoComplete="current-password" style={{ width: "100%", marginTop: 8, padding: 12 }} />
        {params.error && <p style={{ color: "crimson" }}>Incorrect password.</p>}
        <button type="submit" style={{ marginTop: 16, padding: "10px 16px" }}>Sign in</button>
      </form>
    </div>
  );
}
