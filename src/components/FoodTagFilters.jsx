import { SlidersHorizontal, X } from 'lucide-react';
import { SORTS, groupedTags } from '../lib/food-tag-filters.js';
import { Chip } from './ui.jsx';

const GROUP_LABELS = {
  health: 'Health',
  nutrition: 'Nutrition',
  diet: 'Diet',
  processing: 'Processing',
  value: 'Value',
  availability: 'Availability',
  popularity: 'You',
  allergen: 'Allergens',
};

/**
 * Filter and sort controls for the priced list.
 *
 * Only tags something actually carries are offered, so every chip here can
 * return at least one item — a filter that can only ever empty the list is a
 * dead end dressed up as a feature. Counts are on the chips for the same
 * reason: you can see what a filter will cost you before you tap it.
 *
 * Allergens are separated out and phrased as "hide", because that is the only
 * direction they work in. The underlying match is on a product name, which is
 * good enough to warn on and nowhere near good enough to promise with.
 */
export default function FoodTagFilters({
  tags = [], selected = [], onToggle, onClear, sort, onSort, shown, total,
}) {
  const groups = groupedTags(tags);
  if (!groups.length) return null;
  const allergens = groups.find((group) => group.group === 'allergen');
  const rest = groups.filter((group) => group.group !== 'allergen');

  return (
    <div className="mb-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-extrabold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          <SlidersHorizontal size={12} aria-hidden="true" /> Sort
        </span>
        <label className="sr-only" htmlFor="live-price-sort">Sort priced items by</label>
        <select
          id="live-price-sort"
          value={sort}
          onChange={(event) => onSort(event.target.value)}
          className="rounded-xl border px-2.5 py-1.5 font-semibold"
          style={{ borderColor: 'var(--line)', background: 'var(--card)', color: 'var(--ink)' }}
        >
          {SORTS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="press inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.6875rem] font-bold"
            style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
          >
            <X size={11} aria-hidden="true" /> Clear {selected.length} filter{selected.length === 1 ? '' : 's'}
          </button>
        )}
        {/* Deliberately not a live region: the filter chips are aria-pressed, so
            the state change is already announced, and the app caps live regions
            precisely to stop them multiplying like this. */}
        {shown !== total && (
          <span className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {shown} of {total} shown
          </span>
        )}
      </div>

      {rest.map((group) => (
        <div key={group.group}>
          <p className="mb-1 text-[0.65625rem] font-extrabold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
            {GROUP_LABELS[group.group] || group.group}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {group.tags.map((tag) => (
              <Chip
                key={tag.id}
                active={selected.includes(tag.id)}
                onClick={() => onToggle(tag.id)}
              >
                {tag.label} <span style={{ opacity: 0.65 }}>{tag.count}</span>
              </Chip>
            ))}
          </div>
        </div>
      ))}

      {allergens && (
        <div>
          <p className="mb-1 text-[0.65625rem] font-extrabold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
            Hide items that may contain
          </p>
          <div className="flex flex-wrap gap-1.5">
            {allergens.tags.map((tag) => (
              <Chip
                key={tag.id}
                active={selected.includes(tag.id)}
                onClick={() => onToggle(tag.id)}
                tone="danger"
              >
                {tag.label.replace(/^May contain /, '')} <span style={{ opacity: 0.65 }}>{tag.count}</span>
              </Chip>
            ))}
          </div>
          <p className="mt-1 text-[0.65625rem] font-semibold" style={{ color: 'var(--faint)' }}>
            Matched on the product name, so it can only warn — it can never promise an item is free of anything.
          </p>
        </div>
      )}
    </div>
  );
}
