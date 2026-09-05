import { Pill } from './ui.jsx';

/**
 * A topic's plain-language status, shown as the repo's Pill with the reason
 * available as a title. Status words are the map's colour channel's pair: the
 * label carries the meaning, the tone only reinforces it.
 *
 * Accepts either an explicit label/tone/explanation (a `TopicStatusInfo` from
 * topic-status) or a bare status key, so concept statuses (covered/shaky/
 * untouched) and topic statuses (plus in-progress) share one component.
 */
const DEFAULTS = {
  covered: { label: 'Covered', tone: 'good' },
  shaky: { label: 'Needs work', tone: 'warn' },
  'in-progress': { label: 'In progress', tone: 'muted' },
  untouched: { label: 'Not started', tone: 'muted' },
};

export default function TopicStatusTag({ status = '', label = '', tone = '', explanation = '' }) {
  const fallback = DEFAULTS[status] || { label: label || status || 'General', tone: 'muted' };
  const text = label || fallback.label;
  const pillTone = tone || fallback.tone;
  const reason = explanation || `Status: ${text}`;
  return (
    <span title={reason}>
      <Pill tone={pillTone}>{text}</Pill>
    </span>
  );
}
