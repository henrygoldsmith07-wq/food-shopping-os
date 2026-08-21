import { Cloud, CloudOff, Download, LoaderCircle, RefreshCw } from 'lucide-react';
import { useApp } from '../lib/store.jsx';

const ACTIVE = new Set(['live', 'ready', 'connecting', 'reconnecting', 'error', 'offline']);

const canRefreshSync = (kind) => ACTIVE.has(kind);
const canExportSync = (kind) => kind === 'conflict';

const syncCopy = (kind) => ({
  checking: 'Checking household sync',
  live: 'Live household sync',
  ready: 'Household sync on',
  connecting: 'Checking household sync',
  reconnecting: 'Reconnecting household sync',
  error: 'Sync needs attention',
  offline: 'Offline — changes stay on this device',
  conflict: 'Sync conflict — local changes kept',
  'signed-out': 'Sign in to sync',
}[kind] || 'Local-only mode');

export default function CloudSyncRow() {
  const app = useApp();
  const kind = app.cloudStatus?.kind || 'disabled';
  const refreshable = canRefreshSync(kind);
  const exportable = canExportSync(kind);
  const Icon = kind === 'live' || kind === 'ready' ? Cloud : kind === 'connecting' || kind === 'reconnecting' ? LoaderCircle : CloudOff;
  const refresh = () => window.dispatchEvent(new Event('forq-cloud-refresh'));
  const exportBackup = () => {
    const data = app.exportData?.();
    if (!data || typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `forq-${new Date().toISOString().slice(0, 10)}-conflict.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL?.(url), 0);
  };

  return (
    <div className="flex items-center justify-between gap-3 px-5 text-[0.71875rem] font-bold" style={{ color: 'var(--muted)' }}>
      <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
        <Icon size={13} className={kind === 'connecting' || kind === 'reconnecting' ? 'animate-spin' : undefined} />
        {syncCopy(kind)}
      </span>
      {(exportable || refreshable) && (
        <div className="inline-flex shrink-0 items-center gap-1">
          {exportable && (
            <button
              type="button"
              onClick={exportBackup}
              className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2.5"
              aria-label="Export backup before resolving sync conflict"
              style={{ color: 'var(--accent)' }}
            >
              <Download size={13} /> Backup
            </button>
          )}
          {refreshable && (
            <button
              type="button"
              onClick={refresh}
              className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2.5"
              aria-label="Refresh household sync"
              style={{ color: 'var(--accent)' }}
            >
              <RefreshCw size={13} /> Refresh
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export { canExportSync, canRefreshSync, syncCopy };
