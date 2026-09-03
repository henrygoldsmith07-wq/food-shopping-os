import { useRef, useState } from 'react';
import { Download, Lock, RotateCcw, Upload } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { DemoHouseholdEntry } from './DemoWalkthrough.jsx';
import BackendPanel from './BackendPanel.jsx';
import PrivacyPanel from './PrivacyPanel.jsx';
import { Card, Section, Sheet, Toggle } from './ui.jsx';
import { ACCENT_UNLOCKS } from '../data/quests.js';

const UNLOCK_COLOURS = { sage: '#6b7f6a', clay: '#8c5a44', ink: '#2f3640' };
const ACCENTS = [
  ['mono', 'var(--ink)'],
  ['forest', '#3d5c4b'],
  ['ocean', '#3b5b73'],
  ['wine', '#6e4550'],
  ['honey', '#8a6a3b'],
];

/**
 * The settings that were buried inside the "You" dashboard scroll.
 *
 * Appearance, sync, data and privacy are decisions, not day-to-day activity —
 * they change rarely and should never compete with today's numbers for
 * attention. Moving them behind one Settings card keeps "You" about you while
 * giving every configurable thing a single, findable home. Privacy & data is
 * its own section because it carries the highest stakes: nothing about
 * storage, deletion or what leaves the device hides next to an accent picker.
 */
export default function SettingsPanel() {
  const app = useApp();
  const importRef = useRef(null);
  const [dataStatus, setDataStatus] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  /** Your data, as the JSON it is stored as — yours to keep or move. */
  const exportData = () => {
    const blob = new Blob([app.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forq-${app.day}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importData = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const result = app.restoreData(await file.text());
    setDataStatus(result.ok ? 'Backup restored.' : result.error);
  };

  return (
    <div className="space-y-5">
      <Section title="Appearance" className="rise rise-1">
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-[0.875rem]">Dark mode</p>
              <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>Follows your accent everywhere</p>
            </div>
            <Toggle label="Dark mode" on={app.theme === 'dark'} onChange={app.toggleTheme} />
          </div>
          <div>
            <p className="font-bold text-[0.875rem] mb-2">Accent colour</p>
            <div className="flex flex-wrap gap-3">
              {ACCENTS.map(([id, hex]) => (
                <button
                  key={id}
                  onClick={() => app.setAccent(id)}
                  aria-label={`${id} accent`}
                  aria-pressed={app.accent === id}
                  className="tap press h-9 w-9 rounded-full border-4"
                  style={{ background: hex, borderColor: app.accent === id ? 'var(--ink)' : 'transparent' }}
                />
              ))}
              {ACCENT_UNLOCKS.map(({ id, level }) => {
                const open = app.game.accents.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => open && app.setAccent(id)}
                    aria-label={open ? id : `${id} — unlocks at level ${level}`}
                    disabled={!open}
                    className="tap press relative h-9 w-9 rounded-full border-4 flex items-center justify-center"
                    style={{
                      background: UNLOCK_COLOURS[id],
                      borderColor: app.accent === id ? 'var(--ink)' : 'transparent',
                      opacity: open ? 1 : 0.35,
                    }}
                  >
                    {!open && <Lock size={12} color="#fff" />}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Three more arrive at levels 4, 8 and 12. The five you started with never go away.
            </p>
          </div>
        </Card>
      </Section>

      <BackendPanel />

      <Section title="Privacy & data" className="rise rise-2">
        <Card className="space-y-3">
          <DemoHouseholdEntry />
          <p className="text-[0.75rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
            Browser storage is not encrypted. Anyone with access to this browser profile can
            access it. Export a backup before clearing site data or changing devices.
          </p>
          <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Your local copy contains {Object.keys(app.log).length} logged day{Object.keys(app.log).length === 1 ? '' : 's'},
            {' '}{app.pantry.length} pantry item{app.pantry.length === 1 ? '' : 's'}, {app.shops.length} recorded shop{app.shops.length === 1 ? '' : 's'}, {' '}{app.cooked.length} meal{app.cooked.length === 1 ? '' : 's'} cooked.
          </p>
          <button
            type="button" onClick={() => setPrivacyOpen(true)}
            className="press w-full rounded-2xl border px-4 py-3 text-left text-[0.84375rem] font-extrabold"
            style={{ borderColor: 'var(--line)' }}
          >
            Privacy, storage &amp; deletion
          </button>
          <div className="grid grid-cols-3 gap-2.5">
            <button
              onClick={exportData}
              className="press rounded-2xl border py-3 text-[0.84375rem] font-extrabold"
              style={{ borderColor: 'var(--line)' }}
            >
              <span className="inline-flex items-center gap-1.5"><Download size={15} /> Export</span>
            </button>
            <button
              onClick={() => importRef.current?.click()}
              className="press rounded-2xl border py-3 text-[0.84375rem] font-extrabold"
              style={{ borderColor: 'var(--line)' }}
            >
              <span className="inline-flex items-center gap-1.5"><Upload size={15} /> Restore</span>
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              onChange={importData}
              className="hidden"
              aria-label="Restore Forq backup"
            />
            <button
              onClick={() => (confirmReset ? app.reset() : setConfirmReset(true))}
              className="press rounded-2xl border py-3 text-[0.84375rem] font-extrabold"
              style={{ borderColor: confirmReset ? 'var(--danger)' : 'var(--line)', color: confirmReset ? 'var(--danger)' : 'var(--ink)' }}
            >
              <span className="inline-flex items-center gap-1.5">
                <RotateCcw size={15} /> {confirmReset ? 'Tap to confirm' : 'Reset app'}
              </span>
            </button>
          </div>
          {dataStatus && (
            <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {dataStatus}
            </p>
          )}
        </Card>
      </Section>

      <Sheet open={privacyOpen} onClose={() => setPrivacyOpen(false)} title="Privacy & data">
        <PrivacyPanel />
      </Sheet>
    </div>
  );
}