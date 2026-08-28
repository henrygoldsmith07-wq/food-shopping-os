const LEVELS = {
  high: { label: 'High confidence', tone: 'good' },
  medium: { label: 'Medium confidence', tone: 'accent' },
  low: { label: 'Low confidence', tone: 'warn' },
  none: { label: 'Not enough evidence', tone: 'muted' },
};

export const confidenceMeta = (level = 'none') => LEVELS[String(level).toLowerCase()] || LEVELS.none;

export const confidenceLabel = (level) => confidenceMeta(level).label;

export const confidenceTone = (level) => confidenceMeta(level).tone;

export const evidenceConfidence = ({ confidence, source, checkedAt, inferred = false } = {}) => {
  const level = confidence || (source === 'live' ? 'high' : inferred ? 'medium' : 'none');
  const meta = confidenceMeta(level);
  const sourceLabel = source === 'live'
    ? 'Price checked today'
    : source === 'receipt'
      ? 'From your receipt'
      : source === 'history'
        ? 'Estimated from previous purchases'
        : source === 'planned-meals'
          ? 'Quantity inferred from planned meals'
          : source === 'pantry'
            ? 'Based on pantry evidence'
            : null;
  return {
    level,
    label: meta.label,
    tone: meta.tone,
    source,
    sourceLabel,
    checkedAt: checkedAt || null,
    inferred: Boolean(inferred),
  };
};

export const confidenceSummary = (evidence = {}) => evidence.sourceLabel
  ? `${evidence.label} · ${evidence.sourceLabel}`
  : evidence.label || confidenceLabel(evidence.level);
