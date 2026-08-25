import { useState } from 'react';
import {
  Bell, Check, ClipboardList, Copy, Download, Share2, Trash2,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { householdFromShareCode, householdShareCode } from '../lib/household.js';
import { Card, Chip } from './ui.jsx';
import CoachAccess from './CoachAccess.jsx';
import HouseholdAudit from './HouseholdAudit.jsx';
import PeopleView from './FamilyPeople.jsx';

const VIEWS = ['People', 'Tasks', 'Sharing', 'Activity'];
function TasksView() {
  const app = useApp();
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [due, setDue] = useState('');

  const add = () => {
    app.addChore({ title, assigneeId: assigneeId || null, due: due || null });
    setTitle('');
    setDue('');
  };

  return (
    <>
      <Card className="space-y-3">
        <p className="font-extrabold text-[0.9375rem] inline-flex items-center gap-2"><ClipboardList size={16} /> Household tasks</p>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="New household task"
          placeholder="Add a chore"
          className="w-full rounded-xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
          style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
            Assign to
            <select
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
              aria-label="Assign task to"
              className="mt-1 w-full rounded-xl border px-2 py-2 text-[0.75rem] font-bold"
              style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
            >
              <option value="">Anyone</option>
              {app.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          </label>
          <label className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
            Due
            <input
              type="date"
              value={due}
              onChange={(event) => setDue(event.target.value)}
              aria-label="Task due date"
              className="mt-1 w-full rounded-xl border px-2 py-2 text-[0.75rem] font-bold"
              style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
            />
          </label>
        </div>
        <button
          onClick={add}
          disabled={!title.trim()}
          className="press w-full rounded-xl py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          Add task
        </button>
      </Card>

      {app.chores.length ? app.chores.map((chore) => {
        const member = app.members.find((item) => item.id === chore.assigneeId);
        return (
          <Card key={chore.id} className="flex items-center gap-3 !p-3">
            <button
              onClick={() => app.toggleChore(chore.id)}
              aria-label={`${chore.done ? 'Reopen' : 'Complete'} ${chore.title}`}
              className="press flex h-6 w-6 items-center justify-center rounded-full border-2"
              style={chore.done
                ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--on-accent)' }
                : { borderColor: 'var(--line)', color: 'transparent' }}
            >
              <Check size={13} />
            </button>
            <div className="min-w-0 flex-1">
              <p className={`font-bold text-[0.875rem] ${chore.done ? 'line-through opacity-50' : ''}`}>{chore.title}</p>
              <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {member?.name || 'Anyone'}{chore.due ? ` · due ${chore.due}` : ''}
              </p>
            </div>
            <button onClick={() => app.removeChore(chore.id)} aria-label={`Delete ${chore.title}`} className="press p-1" style={{ color: 'var(--faint)' }}>
              <Trash2 size={14} />
            </button>
          </Card>
        );
      }) : (
        <Card className="text-center py-8">
          <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>No household tasks yet.</p>
        </Card>
      )}
    </>
  );
}

function SharingView() {
  const app = useApp();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const ownCode = householdShareCode(app);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ownCode);
      setMessage('Household code copied.');
    } catch {
      setMessage('Copy is unavailable here. Select the code manually.');
    }
  };

  const importCode = () => {
    try {
      app.importHousehold(householdFromShareCode(code));
      setCode('');
      setMessage('Household snapshot imported.');
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <>
      <Card>
        <p className="font-extrabold text-[0.9375rem] inline-flex items-center gap-2"><Share2 size={16} /> Live syncing</p>
        <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Open tabs in this browser update live through browser storage events.
        </p>
        <p className="mt-2 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Signed-in households receive cross-device changes through a private realtime channel. Ably is used when configured; otherwise Forq uses an expiring Redis-backed stream.
        </p>
      </Card>

      {app.hasTool('coach') && <CoachAccess />}

      <Card className="space-y-3">
        <div>
          <p className="font-extrabold text-[0.875rem]">Whole-household snapshot</p>
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Includes profiles, pantry, shopping list and assignments, saved recipes and chores. Importing replaces those shared sections.
          </p>
        </div>
        <textarea
          readOnly
          value={ownCode}
          aria-label="Household share code"
          rows={3}
          className="w-full rounded-xl border p-2 text-[0.6875rem] font-semibold outline-none"
          style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--muted)' }}
        />
        <button onClick={copy} className="press w-full rounded-xl border py-2.5 text-[0.8125rem] font-extrabold" style={{ borderColor: 'var(--line)' }}>
          <span className="inline-flex items-center gap-2"><Copy size={14} /> Copy snapshot</span>
        </button>
        <textarea
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-label="Import household share code"
          placeholder="FORQ-HOUSEHOLD-1…"
          rows={3}
          className="w-full rounded-xl border p-2 text-[0.6875rem] font-semibold outline-none"
          style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}
        />
        <button
          onClick={importCode}
          disabled={!code.trim()}
          className="press w-full rounded-xl py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <span className="inline-flex items-center gap-2"><Download size={14} /> Import snapshot</span>
        </button>
        {message && <p className="text-[0.75rem] font-semibold">{message}</p>}
      </Card>
    </>
  );
}

function ActivityView() {
  const app = useApp();
  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-extrabold text-[0.9375rem] inline-flex items-center gap-2"><Bell size={16} /> Household notifications</p>
            <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>Assignments, chores and shared imports appear here.</p>
          </div>
          {!!app.householdEvents.length && (
            <button onClick={app.clearHouseholdEvents} className="press text-[0.75rem] font-bold" style={{ color: 'var(--muted)' }}>Clear</button>
          )}
        </div>
      </Card>
      {app.householdEvents.length ? [...app.householdEvents].reverse().map((item) => (
        <Card key={item.id} className="!p-3">
          <p className="text-[0.8125rem] font-bold">{item.message}</p>
          <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>{item.date}</p>
        </Card>
      )) : (
        <Card className="text-center py-8">
          <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>No household activity yet.</p>
        </Card>
      )}
      <HouseholdAudit />
    </>
  );
}

export default function FamilyPanel() {
  const app = useApp();
  const [view, setView] = useState('People');

  return (
    <div className="px-5 pb-10 space-y-4">
      <Card>
        <label className="block">
          <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Household name</span>
          <input
            value={app.householdName}
            onChange={(event) => app.setHouseholdName(event.target.value)}
            placeholder={`${app.name || 'My'}’s household`}
            aria-label="Household name"
            className="mt-1 w-full bg-transparent text-[1.1875rem] font-extrabold outline-none"
            style={{ color: 'var(--ink)' }}
          />
        </label>
      </Card>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {VIEWS.map((label) => <Chip key={label} active={view === label} onClick={() => setView(label)}>{label}</Chip>)}
      </div>
      {view === 'People' && <PeopleView />}
      {view === 'Tasks' && <TasksView />}
      {view === 'Sharing' && <SharingView />}
      {view === 'Activity' && <ActivityView />}
    </div>
  );
}
