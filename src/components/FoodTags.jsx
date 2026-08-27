import { Pill } from './ui.jsx';

/**
 * The tag strip under a food item.
 *
 * Order is by how much the tag is worth trusting, not alphabetical: an
 * allergen warning first because it is the one that matters if it is right, a
 * health grade next, then the nutrition claims, then the softer name-derived
 * guesses. Each tag carries its own reasoning in `title`, so "Ultra-processed
 * (est.)" can be interrogated rather than just believed.
 */
const GROUP_ORDER = ['allergen', 'health', 'nutrition', 'value', 'availability', 'diet', 'processing', 'popularity'];

export default function FoodTags({ tags = [], limit = 0 }) {
  if (!tags.length) return null;
  const ordered = [...tags].sort(
    (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group),
  );
  const shown = limit > 0 ? ordered.slice(0, limit) : ordered;
  const rest = ordered.length - shown.length;

  return (
    <ul className="mt-2 flex flex-wrap items-center gap-1.5">
      {shown.map((tag) => (
        <li key={tag.id} title={tag.detail || undefined}>
          <Pill tone={tag.tone}>{tag.label}</Pill>
        </li>
      ))}
      {rest > 0 && (
        <li className="text-[0.65625rem] font-semibold" style={{ color: 'var(--faint)' }}>
          +{rest} more
        </li>
      )}
    </ul>
  );
}
