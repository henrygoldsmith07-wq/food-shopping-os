import { Plus, RotateCcw } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { Chip, Section } from './ui.jsx';

export default function RestockSection({ items = [], store = '' }) {
  const app = useApp();
  if (!items.length) return null;

  const add = (item) => app.addToList({
    name: item.name,
    emoji: item.emoji,
    store,
  });
  const addAll = () => app.addToList(items.map((item) => ({
    name: item.name,
    emoji: item.emoji,
    store,
  })));

  return (
    <Section className="rise rise-2" title="Frequently bought" action="Add all" onAction={addAll}>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
        {items.map((item) => (
          <Chip key={item.name} onClick={() => add(item)}>
            <span className="inline-flex items-center gap-1.5">
              <RotateCcw size={11} /> {item.name} · {item.times}×
            </span>
          </Chip>
        ))}
      </div>
      <p className="mt-2 inline-flex items-center gap-1 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
        <Plus size={12} /> Based on your recorded shops, not generic recommendations.
      </p>
    </Section>
  );
}
