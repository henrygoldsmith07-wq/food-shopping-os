import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Mic, MicOff } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { answer } from '../lib/ai-assistant.js';
import {
  askServerAi, buildAiContext, classifyAiTask, fetchAiUsage, parseAiOutput,
} from '../lib/ai-relay.js';
import { captureSupport } from '../lib/smart-capture.js';
import { Toggle } from './ui.jsx';

const QUICK_PROMPTS = [
  'Generate a pantry recipe',
  'Plan my week',
  'Optimise my shopping',
  'What is my shopping route?',
  'What needs using up?',
  'How am I doing on protein?',
  'Am I on track?',
  'What are my habits?',
  'Eating out — what fits?',
  'Suggest a substitution',
  'Explain tonight’s recipe',
  'Help me cook',
  'Improve my meal',
  'What can I afford this week?',
  'What fits my diet?',
];

export default function AiAssistant() {
  const app = useApp();
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: app.pantry.length || app.entries.length
        ? 'Ask me about your pantry, nutrition, meals, shopping or budget.'
        : 'I read your pantry, diary, plan and shopping history—there’s not much there yet, so start by logging a meal or adding what is in your kitchen.',
    },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  // Server relay: off by default every session, even with the tool enabled.
  // Switching it on is the explicit consent to send this question's words
  // plus allowlisted names (meals, pantry, list gaps — never health data).
  const [serverOn, setServerOn] = useState(false);
  const [usage, setUsage] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const endRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechSupported = captureSupport().speech;
  // The relay needs a signed-in backend household and an API key on the
  // server; it is never offered to under-18 accounts.
  const relayUnlocked = Boolean(app.hasTool?.('assistant')) && !app.youth?.on;

  const refreshUsage = () => {
    setUsageLoading(true);
    fetchAiUsage().then(
      (summary) => { setUsage(summary); setUsageLoading(false); },
      () => { setUsage({ error: 'Budget unavailable — sign-in required.' }); setUsageLoading(false); },
    );
  };

  const toggleServer = () => {
    if (!serverOn && !usage && !usageLoading) refreshUsage();
    setServerOn((current) => !current);
  };

  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, thinking]);
  useEffect(() => () => recognitionRef.current?.stop?.(), []);

  const send = (text) => {
    const question = (text ?? input).trim();
    if (!question || thinking) return;
    setInput('');
    setMessages((current) => [...current, { role: 'user', text: question }]);
    setThinking(true);
    // Nutrition and health questions are always answered on-device, even
    // with the server switched on — they never leave the browser.
    const task = relayUnlocked && serverOn ? classifyAiTask(question) : null;
    if (!task) {
      const note = relayUnlocked && serverOn
        ? '\n\n(Answered on this device — nutrition and health questions never leave it.)'
        : '';
      setTimeout(() => {
        setMessages((current) => [...current, { role: 'ai', text: answer(question, app) + note }]);
        setThinking(false);
      }, 500);
      return;
    }
    askServerAi({ task, prompt: question, context: buildAiContext(app) }).then(
      (result) => {
        const parsed = parseAiOutput(result.output);
        const lines = [parsed.answer];
        if (parsed.suggestions.length) lines.push(`\nSuggestions: ${parsed.suggestions.join(' · ')}`);
        if (parsed.warnings.length) lines.push(`\nNote: ${parsed.warnings.join(' · ')}`);
        setMessages((current) => [...current, {
          role: 'ai',
          text: lines.filter(Boolean).join('\n') || 'The relay answered with nothing readable — try the on-device answer instead.',
          via: `${result.provider || 'server'} · ${result.model || 'unknown model'}`,
        }]);
        setThinking(false);
        refreshUsage();
      },
      (error) => {
        setMessages((current) => [...current, {
          role: 'ai',
          text: `${answer(question, app)}\n\n(Server AI unavailable — ${error.message} Answered on this device instead.)`,
        }]);
        setThinking(false);
      },
    );
  };

  const askByVoice = () => {
    if (!speechSupported) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.lang = 'en-GB';
    recognition.interimResults = false;
    recognition.onresult = (event) => send(event.results[0][0].transcript);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  return (
    <div className="flex flex-col h-[70vh]">
      <div
        className="flex-1 overflow-y-auto no-scrollbar px-5 py-3 space-y-3"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-atomic="false"
      >
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className="max-w-[85%] rounded-2xl px-4 py-2.5 text-[0.875rem] font-medium leading-relaxed whitespace-pre-line"
              style={message.role === 'user'
                ? { background: 'var(--accent)', color: 'var(--on-accent)', borderBottomRightRadius: 6 }
                : { background: 'var(--card)', border: '1px solid var(--line)', borderBottomLeftRadius: 6 }}
            >
              {message.text}
              {message.via && (
                <p className="mt-1.5 text-[0.6875rem] font-bold" style={{ color: 'var(--faint)' }}>
                  via {message.via} · from your household AI budget
                </p>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start" aria-label="Thinking">
            <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
              <span className="inline-flex gap-1">
                {[0, 1, 2].map((index) => (
                  <span
                    key={index}
                    className="pulse-dot h-1.5 w-1.5 rounded-full inline-block"
                    style={{ background: 'var(--faint)', animationDelay: `${index * 200}ms` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="px-5 pb-2 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => send(prompt)}
            className="press shrink-0 rounded-full border px-3 py-1.5 text-[0.75rem] font-bold"
            style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--muted)' }}
          >
            {prompt}
          </button>
        ))}
      </div>

      {relayUnlocked && (
        <div className="px-5 pt-1 pb-1 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[0.75rem] font-extrabold">Server AI</p>
            <p className="text-[0.6875rem] font-semibold leading-snug" style={{ color: 'var(--muted)' }}>
              {usageLoading
                ? 'Checking household budget…'
                : usage?.error
                  ? usage.error
                  : usage
                    ? `${(usage.used + usage.reserved).toLocaleString()} of ${usage.limit.toLocaleString()} tokens used this month`
                    : 'Sends your question with meal, pantry and list names only. Health questions stay on-device.'}
            </p>
          </div>
          <Toggle label="Server AI (uses household budget)" on={serverOn} onChange={toggleServer} />
        </div>
      )}

      <div className="px-5 pb-5 pt-2 flex gap-2 shrink-0">
        <button
          onClick={askByVoice}
          disabled={!speechSupported}
          aria-label={listening ? 'Stop voice assistant' : 'Ask by voice'}
          className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border disabled:opacity-40"
          style={{ borderColor: listening ? 'var(--accent)' : 'var(--line)', color: listening ? 'var(--accent)' : 'var(--muted)' }}
        >
          {listening ? <MicOff size={19} /> : <Mic size={19} />}
        </button>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && send()}
          placeholder="Ask about your food…"
          aria-label="Ask Guidance"
          className="flex-1 rounded-2xl border px-4 py-3 text-[0.875rem] font-semibold outline-none"
          style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
        />
        <button
          onClick={() => send()}
          aria-label="Send"
          className="press flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <ArrowUp size={20} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
