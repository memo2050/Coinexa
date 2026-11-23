import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const SUGGESTIONS = [
  'What can you do for my business?',
  'Show me how you would handle a new enquiry.',
];

export default function AgentChat({ agentId, agentName = 'Agent' }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, sending]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || sending || !agentId) return;

    setError('');
    const next = [...messages, { role: 'user', content: message }];
    setMessages(next);
    setInput('');
    setSending(true);

    try {
      const response = await base44.functions.invoke('chatWithAgent', {
        agentId,
        message,
        history: messages,
      });
      const reply = response.data?.reply;
      if (!reply) throw new Error('The agent returned an empty reply.');
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'The agent could not reply.');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
        <span className="grid h-7 w-7 place-items-center rounded-lg border border-sky-400/30 bg-sky-400/10 text-sky-300">
          <Bot className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{agentName}</p>
          <p className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">Live test</p>
        </div>
      </div>

      <div className="min-h-[16rem] flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {!messages.length && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-slate-400">
              Talk to your agent before you activate it. Nothing is sent to customers here.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-sky-400/40 hover:text-white"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((entry, index) => (
          <div
            key={index}
            className={entry.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                entry.role === 'user'
                  ? 'bg-gradient-to-br from-blue-600 via-sky-500 to-cyan-400 text-white'
                  : 'border border-white/10 bg-white/[0.04] text-slate-200'
              }`}
            >
              {entry.content}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <p className="border-t border-white/[0.07] px-4 py-2 text-xs text-rose-300">{error}</p>
      )}

      <form onSubmit={(event) => { event.preventDefault(); send(); }} className="border-t border-white/[0.07] p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder="Ask your agent something…"
            className="w-full resize-none rounded-xl border border-white/10 bg-[#05070a]/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600 via-sky-500 to-cyan-400 text-white transition-opacity disabled:opacity-40"
            aria-label="Send message"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[0.68rem] text-slate-600">
          <Sparkles className="h-3 w-3" />
          Preview mode — replies are simulated, no external action is taken.
        </p>
      </form>
    </div>
  );
}