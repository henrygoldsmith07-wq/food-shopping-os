import { CheckCircle2 } from 'lucide-react';
import { Card } from './ui.jsx';
import StarterAccount from './AccountSignIn.jsx';
import OnboardingOutcome from './OnboardingOutcome.jsx';
import { ENTRY_GOALS } from './onboarding-config.js';

export default function OnboardingWelcomeStep({ name, setName, entryGoal, setEntryGoal, setStep }) {
  return <>
    <fieldset>
      <legend className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>What would you like help with first?</legend>
      <div className="mt-3 grid gap-2.5">{ENTRY_GOALS.map(({ id, title, text, Icon }) => (
        <button key={id} type="button" aria-pressed={entryGoal === id} onClick={() => setEntryGoal(id)} className="press flex min-h-[4.5rem] w-full items-center gap-3 rounded-[1.25rem] border p-3.5 text-left transition-colors" style={{ background: entryGoal === id ? 'var(--accent-soft)' : 'var(--card)', borderColor: entryGoal === id ? 'var(--accent)' : 'var(--line)', boxShadow: entryGoal === id ? '0 0 0 1px var(--accent), 0 10px 28px color-mix(in srgb, var(--accent) 8%, transparent)' : 'none' }}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: entryGoal === id ? 'var(--accent)' : 'var(--card-2)', color: entryGoal === id ? 'var(--on-accent)' : 'var(--muted)' }}><Icon size={18} /></span>
          <span className="min-w-0"><span className="block text-[0.875rem] font-extrabold">{title}</span><span className="block text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>{text}</span></span>
          <span className="ml-auto shrink-0" style={{ color: entryGoal === id ? 'var(--accent)' : 'var(--line)' }}><CheckCircle2 size={19} strokeWidth={entryGoal === id ? 2.5 : 1.7} /></span>
        </button>
      ))}</div>
    </fieldset>
    <OnboardingOutcome goal={entryGoal} />
    <Card className="space-y-3"><label className="block">
      <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>What should we call you? <span className="normal-case tracking-normal">(optional)</span></span>
      <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setStep(1)} placeholder="Your name" aria-label="Your name" className="mt-1.5 w-full rounded-2xl border px-4 py-3 text-[0.9375rem] font-semibold outline-none" style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }} />
    </label></Card>
    <StarterAccount />
  </>;
}
