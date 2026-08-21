import { useState } from 'react';
import { Check, Flame, Lock, Sparkles, Target, Trophy } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { cx, prettyDate } from '../lib/utils.js';
import { badgeProgress } from '../lib/kitchen.js';
import { XP_AWARDS } from '../data/quests.js';
import { Card, Chip, Meter, Pill } from './ui.jsx';
import { Glyph } from './icons.jsx';

const VIEWS = [
  ['today', 'Today', Target],
  ['week', 'This week', Flame],
  ['long', 'Missions', Trophy],
  ['earned', 'Earned', Sparkles],
];

/** One goal, challenge or mission, with its bar. */
const Quest = ({ quest }) => (
  <Card className="!p-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[0.875rem] font-extrabold leading-tight inline-flex items-center gap-1.5">
          {quest.done && <Check size={14} strokeWidth={3} style={{ color: 'var(--good)' }} />}
          {quest.label}
        </p>
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>{quest.detail}</p>
      </div>
      <Pill tone={quest.done ? 'good' : 'muted'}>{quest.progress}/{quest.of}</Pill>
    </div>
    <div className="mt-2">
      <Meter value={quest.progress} max={quest.of} height={5} color={quest.done ? 'var(--good)' : 'var(--accent)'} />
    </div>
    <p className="mt-1.5 text-[0.71875rem] font-bold" style={{ color: 'var(--faint)' }}>
      {quest.done ? `earned ${quest.xp} XP` : `${quest.xp} XP`}
    </p>
  </Card>
);

/**
 * The game layer, as a page.
 *
 * Nothing here can be completed by tapping anything: every bar is a count of
 * what you actually cooked, logged, planned or bought, so XP is a reading of
 * your own history rather than a balance the app keeps for you.
 */
export default function QuestsPanel() {
  const app = useApp();
  const [view, setView] = useState('today');
  const game = app.game;
  const streakKeys = ['logging', 'cooking', 'onTarget'].filter((key) => game.streaks[key]);
  const badges = badgeProgress(app.stats);
  const earned = badges.filter((b) => b.earned);

  return (
    <div className="px-5 pb-10 space-y-4">
      {/* Level */}
      <Card>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
              Level {game.level.level}
            </p>
            <p className="text-[1.25rem] font-extrabold leading-tight">{game.level.title}</p>
          </div>
          <p className="text-[0.8125rem] font-bold" style={{ color: 'var(--muted)' }}>
            {game.xp.toLocaleString()} XP
          </p>
        </div>
        <div className="mt-2"><Meter value={game.level.into} max={game.level.into + game.level.need} /></div>
        <p className="mt-1.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {game.level.need} XP to level {game.level.level + 1}
          {game.level.nextTitle && ` · ${game.level.nextTitle}`}
        </p>
      </Card>

      {/* Streaks */}
      {/* Under 18 there is no "days on target" streak: hitting a calorie number
          exactly is not something this app scores. */}
      <div className={cx('grid gap-2.5', streakKeys.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {streakKeys.map((key) => {
          const s = game.streaks[key];
          return (
            <Card key={key} className="!p-3 text-center">
              <p className="text-[1.1875rem] font-extrabold">{s.days}</p>
              <p className="text-[0.65625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{s.label}</p>
              <p className="text-[0.65625rem] font-semibold" style={{ color: 'var(--muted)' }}>best {s.best}</p>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {VIEWS.map(([key, label, Icon]) => (
          <Chip key={key} active={view === key} onClick={() => setView(key)}>
            <span className="inline-flex items-center gap-1.5"><Icon size={13} /> {label}</span>
          </Chip>
        ))}
      </div>

      {view === 'today' && (
        <>
          {game.daily.map((goal) => <Quest key={goal.id} quest={goal} />)}
          <p className="text-[0.75rem] font-semibold text-center" style={{ color: 'var(--faint)' }}>
            {game.daily.filter((g) => g.done).length} of {game.daily.length} done today.
          </p>
        </>
      )}

      {view === 'week' && (
        <>
          {game.event && (
            <Card style={{ borderColor: 'var(--accent)' }}>
              <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
                Seasonal · {game.event.name}
              </p>
              <p className="mt-0.5 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>{game.event.blurb}</p>
            </Card>
          )}
          {game.weekly.map((quest) => <Quest key={quest.id} quest={quest} />)}
          <p className="text-[0.75rem] font-semibold text-center" style={{ color: 'var(--faint)' }}>
            Challenges are picked by the week itself, so they’re the same all week.
          </p>
        </>
      )}

      {view === 'long' && game.missions.map((mission) => <Quest key={mission.id} quest={mission} />)}

      {view === 'earned' && (
        <>
          <Card>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>
              Badges · {earned.length} of {badges.length}
            </p>
            <div className="grid grid-cols-4 gap-2.5">
              {badges.map((b) => (
                <div key={b.id} className="text-center" style={{ opacity: b.earned ? 1 : 0.4 }}>
                  <Glyph e={b.emoji} size={22} style={{ color: b.earned ? 'var(--ink)' : 'var(--faint)' }} />
                  <p className="mt-1 text-[0.65625rem] font-bold leading-tight">{b.name}</p>
                  <p className="text-[0.625rem] font-semibold" style={{ color: 'var(--faint)' }}>{b.progress}/{b.of}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Achievements</p>
            {game.achievements.length === 0 ? (
              <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Nothing yet — these are the things that actually happened, with the date they happened on.
              </p>
            ) : (
              game.achievements.map((a) => (
                <div key={a.id} className="mt-2 flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.84375rem] font-bold truncate">{a.label}</p>
                    <p className="text-[0.75rem] font-semibold truncate" style={{ color: 'var(--muted)' }}>{a.detail}</p>
                  </div>
                  {a.date && (
                    <p className="text-[0.71875rem] font-semibold shrink-0" style={{ color: 'var(--faint)' }}>{prettyDate(a.date)}</p>
                  )}
                </div>
              ))
            )}
          </Card>

          <Card>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Where your XP came from</p>
            {game.breakdown.length === 0 ? (
              <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                No XP yet. It’s counted from what you do — cook, log, plan, shop.
              </p>
            ) : (
              game.breakdown.map((row) => (
                <div key={row.key} className="mt-1.5 flex items-baseline justify-between text-[0.8125rem]">
                  <span className="font-bold">{row.label}</span>
                  <span className="font-semibold" style={{ color: 'var(--muted)' }}>
                    {row.count} × {row.each} = {row.xp.toLocaleString()} XP
                  </span>
                </div>
              ))
            )}
            <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              XP is a reading of your history, not a balance — a recipe cooked is worth
              {' '}{XP_AWARDS.cooked} XP for as long as it’s in your history, and no longer.
            </p>
          </Card>

          <Card>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Unlocked</p>
            <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {game.accents.length
                ? `${game.accents.length} extra accent${game.accents.length === 1 ? '' : 's'} — pick one under Appearance.`
                : 'Reach level 4 for a new accent colour. The five you started with never go away.'}
            </p>
            {game.accents.length < 3 && (
              <p className="mt-1 text-[0.75rem] font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--faint)' }}>
                <Lock size={12} /> More at levels 4, 8 and 12.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
