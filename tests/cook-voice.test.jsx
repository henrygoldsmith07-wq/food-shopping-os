import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  canListen, swipeDirection, useStepSpeech, useVoiceCommands, voiceCommand,
} from '../src/lib/cook-voice.js';

describe('voice commands', () => {
  it('reads whole short utterances as commands', () => {
    expect(voiceCommand('Next')).toBe('next');
    expect(voiceCommand('next step please')).toBe('next');
    expect(voiceCommand('Forq, go back.')).toBe('back');
    expect(voiceCommand('say that again')).toBe('repeat');
    expect(voiceCommand('start the timer')).toBe('timer');
  });

  it('ignores a command word inside a sentence', () => {
    expect(voiceCommand('put it back in the oven')).toBeNull();
    expect(voiceCommand('next add the onions')).toBeNull();
    expect(voiceCommand('')).toBeNull();
    expect(voiceCommand(undefined)).toBeNull();
  });
});

describe('swipe', () => {
  it('needs a clear horizontal swipe', () => {
    expect(swipeDirection({ x: 300, y: 100 }, { x: 200, y: 110 })).toBe('next');
    expect(swipeDirection({ x: 100, y: 100 }, { x: 200, y: 90 })).toBe('back');
    expect(swipeDirection({ x: 100, y: 100 }, { x: 130, y: 100 })).toBeNull(); // too short
    expect(swipeDirection({ x: 100, y: 100 }, { x: 180, y: 300 })).toBeNull(); // a scroll
    expect(swipeDirection(null, { x: 1, y: 1 })).toBeNull();
  });
});

class FakeRecognition {
  static last = null;
  constructor() { FakeRecognition.last = this; this.started = 0; this.stopped = false; }
  start() { this.started += 1; }
  stop() { this.stopped = true; }
  hear(transcript) { this.onresult?.({ results: [[{ transcript }]] }); }
}

describe('useVoiceCommands', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); FakeRecognition.last = null; });

  it('is off without browser support', () => {
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', undefined);
    expect(canListen()).toBe(false);
    const { result } = renderHook(() => useVoiceCommands(true, () => {}));
    expect(result.current).toBe('off');
  });

  it('acts on commands, ignores its own read-aloud, restarts after a pause, stops when off', () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    const speech = { speaking: false, cancel: vi.fn(), speak: vi.fn() };
    vi.stubGlobal('speechSynthesis', speech);
    const heard = [];
    const { result, rerender } = renderHook(({ on }) => useVoiceCommands(on, (c) => heard.push(c)), { initialProps: { on: true } });
    expect(result.current).toBe('listening');
    const rec = FakeRecognition.last;
    act(() => rec.hear('next'));
    act(() => rec.hear('put it back in'));
    speech.speaking = true;
    act(() => rec.hear('back'));
    speech.speaking = false;
    act(() => rec.hear('repeat'));
    expect(heard).toEqual(['next', 'repeat']);
    act(() => rec.onend());
    expect(rec.started).toBe(2);
    rerender({ on: false });
    expect(rec.stopped).toBe(true);
    expect(result.current).toBe('off');
  });

  it('reports a refused microphone and stops retrying', () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    const { result } = renderHook(() => useVoiceCommands(true, () => {}));
    const rec = FakeRecognition.last;
    act(() => rec.onerror({ error: 'not-allowed' }));
    expect(result.current).toBe('blocked');
    act(() => rec.onend());
    expect(rec.started).toBe(1);
  });
});

describe('useStepSpeech', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('speaks each step while on, and repeats on request', () => {
    const speak = vi.fn();
    vi.stubGlobal('speechSynthesis', { speaking: false, cancel: vi.fn(), speak });
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(text) { this.text = text; } });
    const { result, rerender } = renderHook(({ text, on }) => useStepSpeech(text, on), { initialProps: { text: 'Fry the onion.', on: false } });
    expect(speak).not.toHaveBeenCalled();
    rerender({ text: 'Fry the onion.', on: true });
    rerender({ text: 'Add the rice.', on: true });
    act(() => result.current());
    expect(speak.mock.calls.map(([u]) => u.text)).toEqual(['Fry the onion.', 'Add the rice.', 'Add the rice.']);
  });
});
