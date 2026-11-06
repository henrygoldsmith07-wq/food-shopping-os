/**
 * Cooking with messy hands: steps read aloud, and "next", "back", "repeat"
 * and "start timer" said instead of tapped — what SideChef, Samsung Food and
 * Yummly call hands-free cooking.
 *
 * Only what the browser itself can do (Web Speech API), so nothing leaves the
 * device through Forq, and each half is offered only where it exists. A
 * command must be the whole thing said ("next", "next step please"), never a
 * word inside a sentence, and anything heard while a step is being read out
 * is ignored, so "put it back in the oven" read aloud never goes back a step.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const COMMANDS = [
  ['next', /^(?:next|next step|go on|carry on|continue|forward|ok next|okay next)$/],
  ['back', /^(?:back|go back|previous|previous step|last step)$/],
  ['repeat', /^(?:repeat|again|say again|say that again|read it again|what was that)$/],
  ['timer', /^(?:start (?:the )?timer|timer|set (?:the )?timer)$/],
];

/** The command a whole utterance gives, or null. */
export const voiceCommand = (transcript) => {
  const said = String(transcript || '').toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\b(?:please|forq|hey|um|uh)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!said) return null;
  return COMMANDS.find(([, pattern]) => pattern.test(said))?.[0] || null;
};

const recognitionCtor = () => (typeof window === 'undefined' ? null
  : window.SpeechRecognition || window.webkitSpeechRecognition || null);

export const canListen = () => Boolean(recognitionCtor());
export const canSpeak = () => typeof window !== 'undefined' && Boolean(window.speechSynthesis) && typeof window.SpeechSynthesisUtterance === 'function';

const isSpeaking = () => typeof window !== 'undefined' && Boolean(window.speechSynthesis?.speaking);

/** Speak `text` whenever it changes while `on`; `say()` repeats it. */
export const useStepSpeech = (text, on) => {
  const say = useCallback(() => {
    if (!canSpeak() || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    window.speechSynthesis.speak(utterance);
  }, [text]);
  useEffect(() => {
    if (on) say();
    return () => { if (canSpeak()) window.speechSynthesis.cancel(); };
  }, [on, say]);
  return say;
};

/**
 * Listen for commands while `on`. Returns the listening state:
 * 'off' | 'listening' | 'blocked' (the microphone was refused).
 * Browsers end recognition after a pause, so it is restarted until turned off.
 */
export const useVoiceCommands = (on, onCommand) => {
  const [state, setState] = useState('off');
  const handler = useRef(onCommand);
  handler.current = onCommand;

  useEffect(() => {
    const Recognition = recognitionCtor();
    if (!on || !Recognition) {
      setState('off');
      return undefined;
    }
    let active = true;
    const recognition = new Recognition();
    recognition.lang = 'en-GB';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      if (isSpeaking()) return; // our own voice reading the step
      const result = event.results[event.results.length - 1];
      const command = voiceCommand(result?.[0]?.transcript);
      if (command) handler.current(command);
    };
    recognition.onerror = (event) => {
      if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
        active = false;
        setState('blocked');
      }
    };
    recognition.onend = () => {
      if (!active) return;
      try { recognition.start(); } catch { /* already restarting */ }
    };
    try {
      recognition.start();
      setState('listening');
    } catch {
      setState('blocked');
    }
    return () => {
      active = false;
      recognition.onend = null;
      try { recognition.stop(); } catch { /* already stopped */ }
    };
  }, [on]);

  return state;
};

/** A horizontal swipe of 60px or more: left is next, right is back. */
export const swipeDirection = (start, end) => {
  if (!start || !end) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? 'next' : 'back';
};
