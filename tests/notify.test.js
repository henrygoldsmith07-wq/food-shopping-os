import { afterEach, describe, expect, it, vi } from 'vitest';
import { askPermission, downloadFile, notifySupport, showNotification } from '../src/lib/notify.js';

const setNotification = (impl) => {
  if (impl === undefined) delete globalThis.Notification;
  else globalThis.Notification = impl;
};

afterEach(() => {
  vi.restoreAllMocks();
  setNotification(undefined);
});

describe('notify', () => {
  it('reports unsupported browsers without throwing', () => {
    setNotification(undefined);
    expect(notifySupport()).toMatchObject({ supported: false, permission: 'unsupported' });
    expect(showNotification('x')).toBe(false);
  });

  it('explains a blocked permission and never shows', () => {
    const ctor = vi.fn();
    ctor.permission = 'denied';
    setNotification(ctor);
    expect(notifySupport().reason).toMatch(/blocked/);
    expect(showNotification('x')).toBe(false);
    expect(ctor).not.toHaveBeenCalled();
  });

  it('askPermission does not re-prompt once decided, and treats a rejected prompt as denied', async () => {
    const ask = vi.fn();
    const ctor = vi.fn();
    ctor.permission = 'granted';
    ctor.requestPermission = ask;
    setNotification(ctor);
    expect(await askPermission()).toBe('granted');
    expect(ask).not.toHaveBeenCalled();
    ctor.permission = 'default';
    ask.mockRejectedValue(new Error('no'));
    expect(await askPermission()).toBe('denied');
  });

  it('shows a notification when granted and returns false if the constructor throws', () => {
    const ctor = vi.fn();
    ctor.permission = 'granted';
    setNotification(ctor);
    expect(showNotification('Hi', { body: 'b', tag: 't' })).toBe(true);
    expect(ctor).toHaveBeenCalledWith('Hi', expect.objectContaining({ body: 'b', tag: 't', silent: false }));
    const bad = vi.fn(() => { throw new Error('boom'); });
    bad.permission = 'granted';
    setNotification(bad);
    expect(showNotification('Hi')).toBe(false);
  });

  it('downloadFile returns false when blob URLs are unavailable and true when it can click', () => {
    const original = URL.createObjectURL;
    URL.createObjectURL = undefined;
    expect(downloadFile('a.ics', 'x')).toBe(false);
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(downloadFile('a.ics', 'x')).toBe(true);
    expect(click).toHaveBeenCalled();
    expect(document.querySelector('a[download]')).toBeNull();
    URL.createObjectURL = original;
  });
});
