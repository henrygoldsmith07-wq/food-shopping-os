import { useApp } from '../lib/store.jsx';
import { YOUTH_COPY, YOUTH_SIGNPOST } from '../lib/youth.js';
import { Card, Section } from './ui.jsx';

/**
 * What under-18 mode is, said once and in full.
 *
 * The mode changes a lot of small things across the app, so somewhere has to
 * list them plainly rather than leaving a user to notice that fasting has gone
 * and wonder what else did. Nothing here is a warning or a judgement — it is a
 * description of the app they have, ending with who to ask about the things
 * the app is not going to answer.
 */
export default function YouthNotice() {
  const app = useApp();
  if (!app.youth.on) return null;

  return (
    <Section title="Under-18 mode" className="rise rise-1">
      <Card className="space-y-2">
        <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>{YOUTH_COPY.mode}</p>
        <ul className="list-disc space-y-1 pl-4 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          <li>{YOUTH_COPY.targets}</li>
          <li>{YOUTH_COPY.weekly}</li>
          <li>{YOUTH_COPY.exercise}</li>
          <li>{YOUTH_COPY.adherence}</li>
          <li>{YOUTH_COPY.comparison}</li>
          <li>{YOUTH_COPY.sharing}</li>
        </ul>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{YOUTH_SIGNPOST}</p>
      </Card>
    </Section>
  );
}
