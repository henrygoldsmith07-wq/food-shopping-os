import { useState } from 'react';
import {
  Trash2, UserPlus, Users,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { DIET_PATTERNS } from '../data/goals.js';
import { ALLERGENS, INTOLERANCES } from '../data/preferences.js';
import { YOUTH_COPY } from '../lib/youth.js';
import { Card, Chip, Pill, Stepper } from './ui.jsx';

/**
 * Who is in the household, what they can do, and what they cannot eat.
 *
 * Allergies are the reason this screen exists and why they are kept apart
 * from dislikes: an allergy is a hard rule that removes a recipe from the app
 * entirely, an intolerance is a warning because the amount is the point, and a
 * dislike is only a preference. Collapsing the three would be the one mistake
 * this whole panel cannot afford.
 */
const PERMISSIONS = [
  ['shopping', 'shop'],
  ['pantry', 'edit pantry'],
  ['recipes', 'save recipes'],
  ['health', 'view health records'],
];

const Toggle = ({ on, onClick, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={onClick}
    className="press relative h-6 w-11 rounded-full"
    style={{ background: on ? 'var(--accent)' : 'var(--line)' }}
  >
    <span
      className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
      style={{ left: 2, transform: on ? 'translateX(20px)' : 'none' }}
    />
  </button>
);

export default function PeopleView() {
  const app = useApp();
  const [name, setName] = useState('');
  const add = () => {
    app.addMember({ name, portions: 1, diets: [] });
    setName('');
  };

  return (
    <>
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Cooking for</p>
            <p className="mt-0.5 text-[0.9375rem] font-extrabold">
              {app.members.length
                ? `${app.members.length} ${app.members.length === 1 ? 'person' : 'people'} · ${app.portions} portion${app.portions === 1 ? '' : 's'} a meal`
                : `Just you · ${app.portions} portion${app.portions === 1 ? '' : 's'} a meal`}
            </p>
          </div>
          {app.activeMember && <Pill tone="accent">{app.childMode ? 'under-18 mode' : 'profile'}: {app.activeMember.name}</Pill>}
        </div>
        <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {app.planDiets.length ? `Plans avoid: ${app.planDiets.join(' · ')}.` : 'No shared dietary patterns set.'}
        </p>
        {app.activeMember && (
          <button
            onClick={() => app.setActiveMember(null)}
            className="press mt-3 rounded-xl border px-3 py-2 text-[0.75rem] font-extrabold"
            style={{ borderColor: 'var(--line)' }}
          >
            Return to my profile
          </button>
        )}
      </Card>

      {app.members.map((member) => {
        const permissions = {
          shopping: true, pantry: true, recipes: true, health: false, ...(member.permissions || {}),
        };
        return (
          <Card key={member.id} className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                value={member.name}
                onChange={(event) => app.updateMember(member.id, { name: event.target.value })}
                aria-label={`Name for ${member.name}`}
                className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-[0.875rem] font-bold outline-none"
                style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}
              />
              <button
                onClick={() => app.removeMember(member.id)}
                aria-label={`Remove ${member.name}`}
                className="press flex h-8 w-8 items-center justify-center rounded-full"
                style={{ background: 'var(--card-2)', color: 'var(--muted)' }}
              >
                <Trash2 size={14} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-2">
                {['adult', 'child'].map((role) => (
                  <button
                    key={role}
                    aria-label={`${role === 'child' ? 'Child' : 'Adult'} profile for ${member.name}`}
                    onClick={() => app.updateMember(member.id, { role })}
                    className="press rounded-full border px-3 py-1.5 text-[0.75rem] font-bold capitalize"
                    style={{
                      borderColor: member.role === role ? 'var(--accent)' : 'var(--line)',
                      color: member.role === role ? 'var(--accent)' : 'var(--muted)',
                    }}
                  >
                    {role}
                  </button>
                ))}
              </div>
              <button
                onClick={() => app.setActiveMember(member.id)}
                aria-label={`Use ${member.name} profile`}
                className="press rounded-xl border px-3 py-2 text-[0.75rem] font-extrabold"
                style={{ borderColor: 'var(--line)' }}
              >
                Use profile
              </button>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Portions</p>
              <Stepper value={member.portions} onChange={(value) => app.updateMember(member.id, { portions: value })} min={0.5} max={4} />
            </div>

            <div>
              <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>Permissions</p>
              {member.role === 'child' && (
                <p className="mb-2 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {YOUTH_COPY.sharing}
                </p>
              )}
              <div className="space-y-2">
                {PERMISSIONS.map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-[0.78125rem] font-semibold capitalize">Can {label}</span>
                    <Toggle
                      on={permissions[key]}
                      onClick={() => app.toggleMemberPermission(member.id, key)}
                      label={`${member.name} can ${label}`}
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <span className="text-[0.78125rem] font-semibold">Household notifications</span>
                  <Toggle
                    on={member.notifications !== false}
                    onClick={() => app.updateMember(member.id, { notifications: member.notifications === false })}
                    label={`${member.name} gets household notifications`}
                  />
                </div>
              </div>
            </div>

            <div>
              <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>Eats</p>
              <div className="flex flex-wrap gap-2">
                {DIET_PATTERNS.filter((diet) => diet.kind !== 'macro').map((diet) => (
                  <Chip
                    key={diet.id}
                    active={member.diets.includes(diet.id)}
                    onClick={() => app.toggleMemberDiet(member.id, diet.id)}
                  >
                    {diet.label}
                  </Chip>
                ))}
              </div>
            </div>

            <AllergenSection
              title="Allergies"
              note="A hard line — recipes naming these are never offered to anyone in the household."
              options={ALLERGENS}
              selected={member.allergies || []}
              onToggle={(value) => app.toggleMemberAllergy(member.id, value)}
            />

            <AllergenSection
              title="Intolerances"
              note="Dose-dependent — recipes flag these and rank down rather than disappearing."
              options={INTOLERANCES}
              selected={member.intolerances || []}
              onToggle={(value) => app.toggleMemberIntolerance(member.id, value)}
            />

            <DislikeSection
              member={member}
              onAdd={(value) => app.toggleMemberDislike(member.id, value)}
              onRemove={(value) => app.toggleMemberDislike(member.id, value)}
            />
          </Card>
        );
      })}

      <Card className="space-y-2.5">
        <p className="text-[0.75rem] font-bold uppercase tracking-wide inline-flex items-center gap-1.5" style={{ color: 'var(--faint)' }}>
          <Users size={13} /> Add someone
        </p>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && add()}
            placeholder="Name"
            aria-label="New household member"
            className="min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
            style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}
          />
          <button
            onClick={add}
            className="press rounded-xl px-4 text-[0.8125rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            <span className="inline-flex items-center gap-1.5"><UserPlus size={14} /> Add</span>
          </button>
        </div>
      </Card>
    </>
  );
}

function AllergenSection({ title, note, options, selected, onToggle }) {
  return (
    <div>
      <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-0.5" style={{ color: 'var(--faint)' }}>{title}</p>
      <p className="mb-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>{note}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Chip
            key={option.id}
            active={selected.includes(option.id)}
            onClick={() => onToggle(option.id)}
          >
            {option.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function DislikeSection({ member, onAdd, onRemove }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim().toLowerCase();
    if (!value || (member.dislikes || []).includes(value)) return;
    onAdd(value);
    setDraft('');
  };
  return (
    <div>
      <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-0.5" style={{ color: 'var(--faint)' }}>Dislikes</p>
      <p className="mb-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
        Things {member.name} doesn’t enjoy — dishes get ranked down, not removed.
      </p>
      <div className="flex flex-wrap gap-2">
        {(member.dislikes || []).map((value) => (
          <Chip key={value} active onClick={() => onRemove(value)}>
            {value} ✕
          </Chip>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && add()}
          placeholder="e.g. mushrooms"
          aria-label={`Dislike for ${member.name}`}
          className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-[0.8125rem] font-semibold outline-none"
          style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}
        />
        <button
          onClick={add}
          disabled={!draft.trim()}
          className="press rounded-xl px-3 py-2 text-[0.75rem] font-extrabold disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          Add dislike
        </button>
      </div>
    </div>
  );
}
