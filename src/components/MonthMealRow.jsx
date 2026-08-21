import { ChefHat, ChevronRight, Pencil, Utensils } from 'lucide-react';
import { Card, FoodArt } from './ui.jsx';

export default function MonthMealRow({ label, recipe, onEdit, onCook }) {
  return (
    <Card className="!p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          aria-label={recipe ? `Edit ${label} meal` : `Plan ${label} meal`}
          className="press flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {recipe
            ? <FoodArt recipe={recipe} className="h-11 w-11 shrink-0 rounded-xl" />
            : <Utensils size={18} className="shrink-0" style={{ color: 'var(--faint)' }} />}
          <span className="min-w-0 flex-1">
            <span className="block text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{label}</span>
            <span className="block truncate font-bold text-[0.90625rem]">{recipe ? recipe.name : 'Nothing planned yet'}</span>
          </span>
          <Pencil size={14} className="shrink-0" style={{ color: 'var(--faint)' }} />
        </button>
        {recipe && (
          <button
            type="button"
            onClick={() => onCook(recipe)}
            aria-label={`Cook ${recipe.name} now`}
            className="press inline-flex shrink-0 flex-col items-center gap-0.5 rounded-xl border px-2 py-1.5 text-[0.625rem] font-extrabold"
            style={{ borderColor: 'var(--line)', color: 'var(--accent)' }}
          >
            <ChefHat size={14} /> Cook
          </button>
        )}
        <ChevronRight size={16} className="shrink-0" style={{ color: 'var(--faint)' }} />
      </div>
    </Card>
  );
}
