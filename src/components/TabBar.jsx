/**
 * The bottom bar (a sidebar on wider screens).
 *
 * It renders whatever the screen registry says the bar is, and nothing else.
 * The five-tab hierarchy — Week, List, Plan, Cook, Recipes — is the default; a
 * product mode can take one off, and a mode that wants a contextual screen
 * (nutrition and the diary) can promote it in. A screen that isn't in the
 * registry cannot appear here, which is what stops the bar and the palette
 * from quietly disagreeing about where things live.
 */

import { cx } from '../lib/utils.js';

export default function TabBar({ tabs, active, onNavigate }) {
  return (
    <nav
      className="app-nav glass"
      style={{ borderColor: 'var(--line)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main navigation"
    >
      <div className="app-brand">
        <img src="/logo.svg" alt="" width={36} height={36} className="h-9 w-9 rounded-xl" aria-hidden="true" />
        <div>
          <p className="text-[1.0625rem] font-black tracking-tight">Forq</p>
          <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>Food, sorted.</p>
        </div>
      </div>
      <div className="app-nav-items">
        {tabs.map(({ id, label, Icon }) => {
          const current = active === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={cx('app-nav-item press', current && 'is-active')}
              aria-current={current ? 'page' : undefined}
              // The colour says which screen you're on; the weight says it
              // again, for anyone who can't see the difference.
              style={{ color: current ? 'var(--accent)' : 'var(--muted)' }}
            >
              <Icon size={21} strokeWidth={current ? 2.4 : 1.8} aria-hidden="true" />
              <span className={cx('app-nav-label', current ? 'font-extrabold' : 'font-semibold')}>{label}</span>
            </button>
          );
        })}
      </div>
      <p className="app-nav-hint"><kbd>⌘ K</kbd> Search anything</p>
    </nav>
  );
}
