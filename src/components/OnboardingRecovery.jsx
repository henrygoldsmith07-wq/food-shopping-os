import { useRef, useState } from 'react';
import { FlaskConical, Upload } from 'lucide-react';
import { useApp } from '../lib/store.jsx';

export default function OnboardingRecovery() {
  const app = useApp();
  const restoreRef = useRef(null);
  const [restoreStatus, setRestoreStatus] = useState('');
  const restore = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setRestoreStatus('Reading backup…');
    try {
      const result = app.restoreData(await file.text());
      setRestoreStatus(result.ok ? 'Backup restored.' : result.error);
    } catch {
      setRestoreStatus('That file could not be read. Choose the backup again to retry.');
    }
  };

  return (
        <div className="mt-4 rounded-2xl border p-4 text-center" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
          <button
            className="press min-h-11 px-4 py-2 text-[0.8125rem] font-extrabold"
            style={{ color: 'var(--accent)' }}
            onClick={app.enterDemoMode}
          >
            <span className="inline-flex items-center gap-1.5"><FlaskConical size={14} /> Explore an example week first</span>
          </button>
          <p className="mt-0.5 px-6 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
            A fully stocked demo kitchen — plan, list, receipts. Nothing is saved and your own start is untouched.
          </p>
          <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--line)' }}>
            <button
              className="press min-h-10 px-4 py-2 text-[0.75rem] font-bold"
              style={{ color: 'var(--muted)' }}
              onClick={() => restoreRef.current?.click()}
            >
              <span className="inline-flex items-center gap-1.5"><Upload size={14} /> Restore an existing backup</span>
            </button>
          </div>
          <input
            ref={restoreRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Restore Forq backup"
            onChange={restore}
          />
          {restoreStatus && <p role="status" className="mt-1 text-[0.75rem] font-semibold">{restoreStatus}</p>}
        </div>
  );
}
