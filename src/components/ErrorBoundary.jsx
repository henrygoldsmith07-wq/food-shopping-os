import { Component } from 'react';
import { AlertTriangle, Download, RotateCcw } from 'lucide-react';
import { downloadFile } from '../lib/notify.js';
import { STORAGE_KEY } from '../lib/state.js';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  readSavedData() {
    try {
      return typeof window === 'undefined' ? '' : window.localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  downloadSavedData = () => {
    const data = this.readSavedData();
    if (data) downloadFile(`forq-${new Date().toISOString().slice(0, 10)}-recovery.json`, data, 'application/json');
  };

  tryAgain = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="mx-auto flex min-h-screen max-w-lg items-center px-5 py-10">
        <section className="card w-full space-y-4 p-5" role="alert">
          <AlertTriangle size={24} style={{ color: 'var(--danger)' }} />
          <div>
            <h1 className="text-xl font-extrabold">Forq hit a problem</h1>
            <p className="mt-1 text-[0.8125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
              Your saved data is still on this device. Try the screen again, or download a copy before reloading if the problem returns.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="press inline-flex items-center gap-1.5 rounded-2xl px-4 py-3 text-[0.8125rem] font-extrabold"
              style={{ background: 'var(--ink)', color: 'var(--bg)' }}
              onClick={this.tryAgain}
            >
              <RotateCcw size={14} /> Try again
            </button>
            <button
              className="press inline-flex items-center gap-1.5 rounded-2xl border px-4 py-3 text-[0.8125rem] font-extrabold"
              style={{ borderColor: 'var(--line)' }}
              onClick={() => window.location.reload()}
            >
              Reload Forq
            </button>
            {this.readSavedData() && (
              <button
                className="press inline-flex items-center gap-1.5 rounded-2xl border px-4 py-3 text-[0.8125rem] font-extrabold"
                style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
                onClick={this.downloadSavedData}
              >
                <Download size={14} /> Download saved data
              </button>
            )}
          </div>
        </section>
      </main>
    );
  }
}
