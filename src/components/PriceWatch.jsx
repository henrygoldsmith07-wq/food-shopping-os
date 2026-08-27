import { TrendingDown, TrendingUp } from 'lucide-react';
import { gbp } from '../lib/utils.js';
import { movementSentence } from '../lib/live-price-alerts.js';
import { lastCheckLabel } from '../lib/daily-price-check.js';
import { Card, Pill, Section, Toggle } from './ui.jsx';

/**
 * What moved since Forq last looked, and whether it keeps looking.
 *
 * This is the payoff for keeping a history: a receipt only moves when you buy
 * the thing again, so a shelf price that climbed 20% since March goes
 * unnoticed until you are standing in front of it. A daily check notices in a
 * day — but only if it is actually running, which is why the switch and the
 * warnings live together rather than in separate corners of the app.
 *
 * Only rises and falls past the threshold appear. Steady items and
 * single-check items are counted, not listed: an app that warns about
 * everything has taught you to ignore its warnings.
 */
export default function PriceWatch({
  movements, dailyEnabled, onToggleDaily, dueLabel, settings, busy,
}) {
  const { rises = [], falls = [], summary = {} } = movements || {};
  const moved = [...rises, ...falls];

  return (
    <Section className="rise rise-1" title="Price watch">
      <Card className="!p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-[0.875rem]">Check once a day</p>
            <p className="mt-0.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Re-checks your list when you open Forq and a day has passed. Off by default,
              because checking nine shops is not something to start doing on your behalf.
            </p>
          </div>
          <Toggle on={dailyEnabled} onChange={onToggleDaily} label="Check prices once a day" />
        </div>
        <p className="mt-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
          {busy ? 'Checking now…' : dueLabel} {dailyEnabled && lastCheckLabel(settings)}
        </p>
      </Card>

      {summary.tracked > 0 && (
        <p className="mt-2.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Watching {summary.tracked} item{summary.tracked === 1 ? '' : 's'} ·{' '}
          {summary.rises} up · {summary.falls} down · {summary.steady} steady
          {summary.watching > 0 && ` · ${summary.watching} needs a second check`}
        </p>
      )}

      {moved.length > 0 ? (
        <div className="mt-2 space-y-2">
          {moved.map((movement) => {
            const up = movement.kind === 'rise';
            const Icon = up ? TrendingUp : TrendingDown;
            return (
              <Card key={`${movement.kind}-${movement.name}`} className="!p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-bold text-[0.875rem]">
                      <Icon
                        size={14}
                        aria-hidden="true"
                        style={{ color: up ? 'var(--danger)' : 'var(--good)' }}
                      />
                      <span className="truncate">{movement.name}</span>
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                      {movementSentence(movement)}
                    </p>
                    <p className="mt-0.5 text-[0.65625rem] font-semibold" style={{ color: 'var(--faint)' }}>
                      {gbp(movement.baseline, { always: true })} → {gbp(movement.latest, { always: true })}
                      {' · '}{movement.checks} checks since {movement.since}
                      {' · '}{movement.provenance}
                    </p>
                  </div>
                  <Pill tone={up ? 'danger' : 'good'}>
                    {up ? '+' : ''}{movement.pct}%
                  </Pill>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="mt-2 text-center py-5">
          <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {summary.tracked
              ? 'Nothing has moved past your rise or fall threshold.'
              : 'Check your list a couple of times and Forq will tell you what moved.'}
          </p>
        </Card>
      )}

      {moved.length > 0 && (
        <p className="mt-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
          Measured against the median of earlier checks, using the same thresholds as your
          receipt alerts — tune them under Budget. These are shop pages Forq read, not receipts.
        </p>
      )}
    </Section>
  );
}
