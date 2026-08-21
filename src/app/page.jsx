import ClientRoot from './ClientRoot.jsx';

export const dynamic = 'force-dynamic';

function LaunchShell() {
  return (
    <div className="launch-shell" aria-hidden="true">
      <header className="launch-header">
        <span className="launch-brand">F</span>
        <span className="launch-line launch-line-title" />
        <span className="launch-avatar" />
      </header>
      <main className="launch-content">
        <span className="launch-line launch-line-kicker" />
        <span className="launch-line launch-line-heading" />
        <div className="launch-card">
          <span className="launch-line launch-line-card-title" />
          <span className="launch-line" />
          <span className="launch-line launch-line-short" />
        </div>
        <div className="launch-card launch-card-small" />
      </main>
      <nav className="launch-nav">
        {['Home', 'Plan', 'Log', 'Shop', 'Recipes'].map((label) => (
          <span key={label} className="launch-nav-item">{label}</span>
        ))}
      </nav>
    </div>
  );
}

export default function Page() {
  return (
    <>
      <LaunchShell />
      <ClientRoot />
    </>
  );
}
