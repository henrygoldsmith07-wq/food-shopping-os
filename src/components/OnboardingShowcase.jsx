import { LockKeyhole, Sparkles, UtensilsCrossed } from 'lucide-react';
import { FoodArt } from './ui.jsx';

export default function OnboardingShowcase({ ideaCards, compact = false }) {
  return (
    <section className={`${compact ? 'hidden lg:flex' : 'flex'} flex-col justify-between gap-6 py-2 lg:sticky lg:top-0 lg:min-h-[calc(100vh-3.5rem)] lg:py-8`}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-10 w-10 place-items-center rounded-2xl" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}><UtensilsCrossed size={19} strokeWidth={1.8} /></span>
        <span className="text-[0.875rem] font-black uppercase tracking-[0.2em]">Forq</span>
        <span className="ml-auto hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.6875rem] font-bold sm:inline-flex lg:hidden" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}><LockKeyhole size={12} /> Local first</span>
      </div>
      <div className="max-w-xl">
        <p className="mb-3 inline-flex items-center gap-1.5 text-[0.6875rem] font-extrabold uppercase tracking-[0.16em]" style={{ color: 'var(--accent)' }}><Sparkles size={13} /> A calmer way to plan your week</p>
        <h2 className="max-w-lg text-[2.25rem] font-black leading-[1.04] tracking-[-0.055em] sm:text-[3rem] lg:text-[3.6rem]">Good food.<br className="hidden sm:block" /> Less guesswork.</h2>
        <p className="mt-4 max-w-md text-[0.9375rem] font-medium leading-relaxed" style={{ color: 'var(--muted)' }}>Tell Forq what you are eating; it works out what to buy; it helps you waste less.</p>
      </div>
      <div className="hidden space-y-3 lg:block">
        <div className="flex items-center justify-between"><p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em]" style={{ color: 'var(--faint)' }}>A taste of your recipe book</p><span className="text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>Suggestions, never a plan</span></div>
        {ideaCards.length ? <div className="grid grid-cols-2 gap-3">{ideaCards.map(({ recipe }, index) => (
          <div key={recipe.id} className={`overflow-hidden rounded-[1.4rem] border ${index === 0 ? 'row-span-2' : ''}`} style={{ borderColor: 'var(--line)', background: 'var(--card)', boxShadow: '0 18px 50px color-mix(in srgb, var(--ink) 7%, transparent)' }}>
            <FoodArt recipe={recipe} className={index === 0 ? 'h-52 w-full' : 'h-24 w-full'} px={index === 0 ? 36 : 22} />
            <div className="p-3"><p className="line-clamp-2 text-[0.8125rem] font-extrabold leading-snug">{recipe.name}</p><p className="mt-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>{Number(recipe.costPerServing) > 0 ? `£${Number(recipe.costPerServing).toFixed(2)} per serving` : 'Cost estimate unavailable'}</p></div>
          </div>
        ))}</div> : <div className="rounded-[1.4rem] border p-5 text-[0.8125rem] font-semibold" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>Your recipe ideas will appear here once your food preferences are set.</div>}
      </div>
      <div className="hidden items-center gap-3 border-t pt-4 text-[0.75rem] font-semibold lg:flex" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}><span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><LockKeyhole size={14} /></span><span><strong style={{ color: 'var(--ink)' }}>Private by default.</strong> No account needed. Sync is optional.</span></div>
    </section>
  );
}
