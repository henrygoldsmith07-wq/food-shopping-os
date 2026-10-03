'use client';

import Link from 'next/link';

/**
 * Forq instant demo landing — the 30-second case.
 *
 * The seeded week lives in the isolated demo sandbox (`?demo=1`); this page
 * shows what the sandbox proves, in the order the product works: what you're
 * eating, what that means you must buy, and how doing it makes the next week
 * better. Nothing here touches the real kitchen.
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
      <h1 className="mt-3 text-4xl font-black tracking-tight">
        Tell Forq what you’re eating.<br />
        <span style={{ color: 'var(--muted)' }}>It works out what you need to buy.</span>
      </h1>
      <p className="mx-auto mt-4 max-w-2xl text-base font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
        A seeded week in an isolated sandbox. Watch the loop close in four moves —
        nothing is saved, counted or synced.
      </p>

      <ol className="mx-auto mt-8 max-w-xl space-y-3 text-left">
        {[
          {
            n: 1,
            title: 'Meals are planned',
            body: 'Seven dinners sit on the calendar — including one that uses something going off soon.',
          },
          {
            n: 2,
            title: 'The pantry is subtracted',
            body: 'Rice, oil, garlic and onions are already in the demo kitchen, so the list never asks for them.',
          },
          {
            n: 3,
            title: 'The list reflects the plan',
            body: 'One aisle-ready list, quantities scaled for two people. Tick items as you shop, record the trip, and it lands in the pantry.',
          },
          {
            n: 4,
            title: 'Outcomes change the next recommendation',
            body: 'Cook a meal and Forq spends the pantry it used, saves the leftovers, and suggests something better for tomorrow.',
          },
        ].map((step) => (
          <li
            key={step.n}
            className="flex gap-3 rounded-2xl border p-4"
            style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-black"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              {step.n}
            </span>
            <span>
              <span className="block text-[0.9375rem] font-extrabold">{step.title}</span>
              <span className="mt-0.5 block text-[0.8125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
                {step.body}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <Link
        href="/?demo=1"
        className="press mt-8 inline-flex rounded-2xl px-6 py-4 text-sm font-black"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        Explore the example week →
      </Link>
      <p className="mt-3 text-[0.6875rem] font-bold" style={{ color: 'var(--faint)' }}>
        No account · nothing saved · exit anytime
      </p>
    </main>
  );
}
