'use client';

import Link from 'next/link';

/**
 * Forq instant demo — the food loop.
 * Seeded week lives in the isolated demo sandbox (`?demo=1`); nothing here
 * touches the real kitchen.
 */
export default function DemoPage() {
  return (
    <main
      className="mx-auto min-h-screen max-w-3xl px-5 py-10 text-center"
      style={{ background: 'var(--bg)', color: 'var(--ink)' }}
    >
      <p className="text-[0.6875rem] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--accent)' }}>
        Forq · instant demo
      </p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">Plan → Shop → Eat.</h1>
      <p className="mx-auto mt-4 max-w-2xl text-base font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
        A seeded week with a plan, a pantry-aware shopping list, receipts and coaching.
        Explore it in an isolated sandbox — nothing is saved or counted.
      </p>
      <ol className="mx-auto mt-6 max-w-xl space-y-2 text-left text-[0.875rem] font-semibold" style={{ color: 'var(--muted)' }}>
        <li><strong style={{ color: 'var(--ink)' }}>1. Plan the week</strong> — seven dinners already on the calendar.</li>
        <li><strong style={{ color: 'var(--ink)' }}>2. Shop once</strong> — one aisle-ready list, pantry already subtracted.</li>
        <li><strong style={{ color: 'var(--ink)' }}>3. Cook &amp; learn</strong> — leftovers, waste and next-week lessons.</li>
      </ol>
      <Link
        href="/?demo=1"
        className="press mt-8 inline-flex rounded-2xl px-5 py-3.5 text-sm font-black"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        Explore an example week →
      </Link>
      <p className="mt-3 text-[0.6875rem] font-bold" style={{ color: 'var(--faint)' }}>
        No account · nothing saved · exit anytime
      </p>
    </main>
  );
}
