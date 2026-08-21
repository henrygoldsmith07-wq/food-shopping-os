import { useRef, useState } from 'react';
import { CalendarClock, Upload } from 'lucide-react';
import { busyFromIcs, readCalendarAvailability } from '../lib/calendar.js';
import { useApp } from '../lib/store.jsx';

export default function CalendarAvailability({ dates }) {
  const app = useApp();
  const fileRef = useRef(null);
  const [provider, setProvider] = useState('google');
  const [reading, setReading] = useState(false);
  const [status, setStatus] = useState('');

  const mergeBusy = (busy) => {
    const inRange = busy.filter((item) => dates.includes(item.date));
    const outsideRange = (app.calendarBusy || []).filter((item) => !dates.includes(item.date));
    const byDate = new Map([...outsideRange, ...inRange].map((item) => [item.date, item]));
    app.set({ calendarBusy: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) });
    return inRange.length;
  };

  const importAvailability = async () => {
    setReading(true);
    setStatus('');
    try {
      const busy = await readCalendarAvailability(provider, dates);
      const n = mergeBusy(busy);
      setStatus(
        n
          ? `${n} busy evening${n === 1 ? '' : 's'} imported. The generator will leave them empty.`
          : 'No events overlap dinner time in this range.',
      );
    } catch (error) {
      setStatus(error.message);
    } finally {
      setReading(false);
    }
  };

  /** Local-first path: Chrono → Export for meal planner → import here (no account). */
  const importIcsFile = async (file) => {
    if (!file) return;
    setReading(true);
    setStatus('');
    try {
      const text = await file.text();
      const busy = busyFromIcs(text, { source: 'Chrono ICS' });
      const n = mergeBusy(busy);
      setStatus(
        n
          ? `${n} busy evening${n === 1 ? '' : 's'} from ICS. Generator skips those dinners.`
          : 'ICS read OK, but no dinner-window conflicts in this plan range.',
      );
    } catch {
      setStatus('Could not read that calendar file. Export .ics from Chrono and try again.');
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const busyInRange = (app.calendarBusy || []).filter((item) => dates.includes(item.date));

  return (
    <div className="mt-3 space-y-2">
      <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
        Calendar availability
      </p>
      <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
        Import busy evenings from Chrono (.ics) or a connected calendar. The meal generator leaves those nights empty.
      </p>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <select
          value={provider}
          onChange={(event) => setProvider(event.target.value)}
          aria-label="Calendar provider"
          className="rounded-2xl border px-3 py-2.5 text-[0.8125rem] font-bold"
          style={{ borderColor: 'var(--line)', background: 'var(--card)', color: 'var(--ink)' }}
        >
          <option value="google">Google Calendar</option>
          <option value="azure-ad">Outlook Calendar</option>
        </select>
        <button
          type="button"
          onClick={importAvailability}
          disabled={reading}
          className="press rounded-2xl border px-3 py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-50"
          style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
        >
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock size={15} /> {reading ? 'Reading…' : 'Find busy evenings'}
          </span>
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".ics,text/calendar"
        className="sr-only"
        aria-label="Import Chrono or other ICS file"
        onChange={(event) => importIcsFile(event.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={reading}
        className="press w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-50"
        style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
      >
        <span className="inline-flex items-center gap-1.5">
          <Upload size={15} /> Import Chrono / ICS busy evenings
        </span>
      </button>
      {busyInRange.length > 0 && (
        <div className="rounded-2xl border px-3 py-2" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
          <p className="text-[0.75rem] font-bold" style={{ color: 'var(--muted)' }}>
            {busyInRange.length} busy evening{busyInRange.length === 1 ? '' : 's'} in this range
          </p>
          <p className="text-[0.7rem] font-semibold mt-0.5" style={{ color: 'var(--faint)' }}>
            {busyInRange.map((b) => b.date).join(' · ')}
          </p>
          <button
            type="button"
            className="press mt-2 text-[0.75rem] font-extrabold"
            style={{ color: 'var(--muted)' }}
            onClick={() => {
              app.set({
                calendarBusy: (app.calendarBusy || []).filter((item) => !dates.includes(item.date)),
              });
              setStatus('Cleared busy evenings for this range.');
            }}
          >
            Clear busy evenings here
          </button>
        </div>
      )}
      {status && <p className="text-center text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{status}</p>}
    </div>
  );
}

