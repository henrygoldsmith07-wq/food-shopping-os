import { useEffect, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { STORAGE_KEY } from '../lib/state.js';
import {
  appStorageTotal, formatBytes, LEVEL_COPY, storageLevel, storageUsage,
} from '../lib/storage-health.js';

/**
 * How full this device is, next to the data it holds.
 *
 * The app's own keys are always countable; the browser-wide quota is shown
 * when the browser reports it. Either way the user gets words — plenty of
 * room, getting full, nearly out — with the export path already sitting in
 * the same card, because the remedy lives next to the diagnosis.
 */
export default function StorageHealth() {
  const [estimate, setEstimate] = useState(null);

  useEffect(() => {
    let alive = true;
    storageUsage().then((result) => {
      if (alive) setEstimate(result);
    });
    return () => {
      alive = false;
    };
  }, []);

  const appBytes = appStorageTotal([STORAGE_KEY, 'forq-cloud-meta-v1', 'forq-cloud-queue-v1']);
  const level = storageLevel(estimate?.pct ?? null);
  const words = LEVEL_COPY[level];

  return (
    <div className="flex items-start gap-2.5 rounded-2xl border p-3" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
      <HardDrive size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--muted)' }} />
      <div className="min-w-0">
        <p className="text-[0.75rem] font-bold">
          {estimate?.supported && estimate.quotaBytes != null
            ? `${formatBytes(estimate.usageBytes)} of ${formatBytes(estimate.quotaBytes)} used on this device`
            : `${formatBytes(appBytes)} of app data on this device`}
        </p>
        <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>{words}</p>
      </div>
    </div>
  );
}