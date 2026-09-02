import ClientRoot from './ClientRoot.jsx';
import Link from 'next/link';
import { PRODUCT } from '../data/product.js';

export const dynamic = 'force-dynamic';

function LandingIntro() {
  return (
    <section className="mx-auto max-w-3xl px-5 pb-8 pt-10 text-center sm:pt-16">
      <p className="text-[0.6875rem] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--accent)' }}>Forq</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">{PRODUCT.promise}</h1>
      <p className="mx-auto mt-4 max-w-2xl text-base font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>{PRODUCT.promiseLong}</p>
      <Link href="/demo" className="press mt-6 inline-flex rounded-2xl px-5 py-3.5 text-sm font-black" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>Explore the instant demo →</Link>
    </section>
  );
}

function LaunchShell() {
  return (
    <div className="launch-shell" aria-hidden="true">
      <LandingIntro />
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
