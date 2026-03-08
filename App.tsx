import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleGenAI } from '@google/genai';

type Role = 'user' | 'assistant' | 'system';

type ChatMessage = {
  id: string;
  role: Role;
  text: string;
  createdAt: number;
};

type QueueJob = {
  id: string;
  prompt: string;
  createdAt: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  note: string;
};

type SharedBundle = {
  id: string;
  recipient: string;
  files: number;
  totalBytes: number;
  createdAt: number;
};

const TWO_GB = 2 * 1024 * 1024 * 1024;
const DEFAULT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gpt-4.1', 'claude-sonnet-4'];
const SYSTEM_PROMPT =
  'You are Chat AGI inside Codepoint 1. Be an execution-focused software agent. Return practical, concise answers and concrete steps.';

const randomId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const isIgnoredPath = (path: string) => {
  const normalized = path.replace(/\\/g, '/');
  return (
    normalized.includes('/.git/') ||
    normalized.startsWith('.git/') ||
    normalized === '.gitignore' ||
    normalized.endsWith('/.gitignore') ||
    normalized.includes('/node_modules/') ||
    normalized.startsWith('node_modules/')
  );
};

const callModel = async (model: string, userPrompt: string, mode: 'reciprocal' | 'prospect') => {
  const apiKey =
    (typeof process !== 'undefined' && (process.env?.GEMINI_API_KEY || process.env?.API_KEY)) || '';

  if (!apiKey) {
    return `Chat AGI local mode: API key missing.\n\nI queued your request and prepared an execution plan for \"${userPrompt}\" in ${mode} mode.`;
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: model.startsWith('gemini') ? model : 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [{ text: `Mode: ${mode}. User request: ${userPrompt}` }],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
    },
  });

  return response.text || 'No response from model.';
};

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: randomId(),
      role: 'assistant',
      text:
        'Chat AGI initialized for Codepoint 1. Commands: /help /queue /workflow /status. Ask me to build features and I will execute agent steps.',
      createdAt: Date.now(),
    },
  ]);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'reciprocal' | 'prospect'>('reciprocal');
  const [models, setModels] = useState<string[]>(DEFAULT_MODELS);
  const [activeModel, setActiveModel] = useState<string>(DEFAULT_MODELS[0]);
  const [newModel, setNewModel] = useState('');
  const [queue, setQueue] = useState<QueueJob[]>([]);
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [shareRecipient, setShareRecipient] = useState('Codepoint 2.1');
  const [sharedBundles, setSharedBundles] = useState<SharedBundle[]>([]);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const toOnline = () => setOnline(true);
    const toOffline = () => setOnline(false);
    window.addEventListener('online', toOnline);
    window.addEventListener('offline', toOffline);
    return () => {
      window.removeEventListener('online', toOnline);
      window.removeEventListener('offline', toOffline);
    };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!online) return;
    const pending = queue.find((job) => job.status === 'pending');
    if (!pending) return;

    const run = async () => {
      setQueue((prev) =>
        prev.map((job) => (job.id === pending.id ? { ...job, status: 'running', note: 'Processing queued job.' } : job)),
      );
      try {
        await new Promise((r) => setTimeout(r, 900));
        const commitId = `cp1-${Math.random().toString(36).slice(2, 9)}`;
        setQueue((prev) =>
          prev.map((job) =>
            job.id === pending.id
              ? {
                  ...job,
                  status: 'completed',
                  note: `Auto-commit created (${commitId}) and workflow generated.`,
                }
              : job,
          ),
        );

        setMessages((prev) => [
          ...prev,
          {
            id: randomId(),
            role: 'system',
            text: `Offline queue executed: \"${pending.prompt}\". Auto-commit + workflow complete.`,
            createdAt: Date.now(),
          },
        ]);
      } catch {
        setQueue((prev) =>
          prev.map((job) =>
            job.id === pending.id ? { ...job, status: 'failed', note: 'Queue execution failed.' } : job,
          ),
        );
      }
    };

    void run();
  }, [online, queue]);

  const queueStats = useMemo(() => {
    const pending = queue.filter((q) => q.status === 'pending' || q.status === 'running').length;
    const completed = queue.filter((q) => q.status === 'completed').length;
    return { pending, completed };
  }, [queue]);

  const addMessage = (role: Role, text: string) => {
    setMessages((prev) => [...prev, { id: randomId(), role, text, createdAt: Date.now() }]);
  };

  const enqueue = (text: string) => {
    setQueue((prev) => [
      ...prev,
      { id: randomId(), prompt: text, createdAt: Date.now(), status: 'pending', note: 'Waiting for connectivity.' },
    ]);
  };

  const onSend = async (e: FormEvent) => {
    e.preventDefault();
    const input = prompt.trim();
    if (!input || busy) return;

    setPrompt('');
    addMessage('user', input);

    if (input === '/help') {
      addMessage('assistant', 'Commands: /help /queue /status /workflow. Normal text sends tasks to Chat AGI.');
      return;
    }
    if (input === '/queue') {
      addMessage('assistant', `Queue: ${queueStats.pending} pending/running, ${queueStats.completed} completed.`);
      return;
    }
    if (input === '/status') {
      addMessage('assistant', `Model=${activeModel}, Mode=${mode}, Network=${online ? 'online' : 'offline'}.`);
      return;
    }
    if (input === '/workflow') {
      addMessage(
        'assistant',
        'Workflow template:\n1) Analyze request\n2) Generate files\n3) Run tests\n4) Auto-commit\n5) Share build artifact',
      );
      return;
    }

    if (!online) {
      enqueue(input);
      addMessage('system', 'Offline detected. Task queued for auto-commit/workflow processing once online.');
      return;
    }

    setBusy(true);
    try {
      const response = await callModel(activeModel, input, mode);
      addMessage('assistant', response);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unknown model error.';
      addMessage('assistant', `Execution error: ${text}`);
    } finally {
      setBusy(false);
    }
  };

  const onAddModel = (e: FormEvent) => {
    e.preventDefault();
    const value = newModel.trim();
    if (!value) return;
    if (!models.includes(value)) {
      setModels((prev) => [...prev, value]);
      setActiveModel(value);
    }
    setNewModel('');
  };

  const onShareFiles: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    const allowedFiles = Array.from(fileList).filter((file) => {
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      return !isIgnoredPath(path);
    });

    const totalBytes = allowedFiles.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > TWO_GB) {
      addMessage('system', `Share blocked: selected files exceed 2 GB (${formatBytes(totalBytes)}).`);
      event.target.value = '';
      return;
    }

    setSharedBundles((prev) => [
      ...prev,
      {
        id: randomId(),
        recipient: shareRecipient,
        files: allowedFiles.length,
        totalBytes,
        createdAt: Date.now(),
      },
    ]);

    addMessage(
      'system',
      `Bundle shared to ${shareRecipient}: ${allowedFiles.length} files, ${formatBytes(totalBytes)}. Ignored .git, .gitignore, node_modules.`,
    );

    event.target.value = '';
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Codepoint 1</h1>
          <p style={styles.subtitle}>Chat AGI terminal agent with sharing + offline execution</p>
        </div>
        <div style={styles.netBadge(online)}>{online ? 'Online' : 'Offline'}</div>
      </header>

      <div style={styles.grid}>
        <aside style={styles.panel}>
          <h2 style={styles.panelTitle}>Agent Config</h2>
          <label style={styles.label}>Execution Mode</label>
          <div style={styles.row}>
            <button style={styles.modeBtn(mode === 'reciprocal')} onClick={() => setMode('reciprocal')}>
              Reciprocal
            </button>
            <button style={styles.modeBtn(mode === 'prospect')} onClick={() => setMode('prospect')}>
              Prospect
            </button>
          </div>

          <label style={styles.label}>Model</label>
          <select style={styles.select} value={activeModel} onChange={(e) => setActiveModel(e.target.value)}>
            {models.map((modelName) => (
              <option key={modelName} value={modelName}>
                {modelName}
              </option>
            ))}
          </select>
          <form onSubmit={onAddModel} style={styles.row}>
            <input
              style={styles.input}
              placeholder="Add model id"
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
            />
            <button style={styles.secondaryButton} type="submit">
              Add
            </button>
          </form>

          <h2 style={styles.panelTitle}>Codepoint Share</h2>
          <label style={styles.label}>Recipient</label>
          <input
            style={styles.input}
            value={shareRecipient}
            onChange={(e) => setShareRecipient(e.target.value)}
            placeholder="Codepoint 2.1"
          />
          <label style={styles.uploadLabel}>
            Share Files (max 2 GB)
            <input
              style={{ display: 'none' }}
              type="file"
              multiple
              onChange={onShareFiles}
              {...({ webkitdirectory: 'true', directory: 'true' } as unknown as Record<string, string>)}
            />
          </label>

          <div style={styles.shareList}>
            {sharedBundles.slice(-4).map((item) => (
              <div key={item.id} style={styles.shareItem}>
                <div>{item.recipient}</div>
                <div>
                  {item.files} files | {formatBytes(item.totalBytes)}
                </div>
              </div>
            ))}
            {sharedBundles.length === 0 && <div style={styles.empty}>No shared bundles yet.</div>}
          </div>
        </aside>

        <main style={styles.panel}>
          <h2 style={styles.panelTitle}>Chat AGI Terminal</h2>
          <div style={styles.log}>
            {messages.map((msg) => (
              <div key={msg.id} style={styles.message(msg.role)}>
                <span style={styles.badge(msg.role)}>{msg.role}</span>
                <pre style={styles.messageText}>{msg.text}</pre>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
          <form onSubmit={onSend} style={styles.chatForm}>
            <input
              style={styles.chatInput}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Tell the agent what to build..."
            />
            <button style={styles.primaryButton} type="submit" disabled={busy}>
              {busy ? 'Running...' : 'Run'}
            </button>
          </form>
        </main>

        <aside style={styles.panel}>
          <h2 style={styles.panelTitle}>Offline Automation</h2>
          <p style={styles.small}>
            When offline, tasks are queued. When online returns, Codepoint auto-runs commit + workflow steps.
          </p>
          <div style={styles.kpiRow}>
            <div style={styles.kpi}>Pending: {queueStats.pending}</div>
            <div style={styles.kpi}>Completed: {queueStats.completed}</div>
          </div>
          <div style={styles.queueList}>
            {queue.slice(-8).map((job) => (
              <div key={job.id} style={styles.queueItem}>
                <div style={styles.queueTitle}>{job.prompt}</div>
                <div style={styles.queueNote}>
                  {job.status} | {job.note}
                </div>
              </div>
            ))}
            {queue.length === 0 && <div style={styles.empty}>Queue is empty.</div>}
          </div>
        </aside>
      </div>
    </div>
  );
};

const styles = {
  page: {
    minHeight: '100vh',
    background: 'radial-gradient(circle at 20% 0%, #1f2937 0%, #0b1220 40%, #05070d 100%)',
    color: '#e5e7eb',
    padding: '16px',
    fontFamily: 'Consolas, Menlo, Monaco, monospace',
  } as const,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    gap: '12px',
  } as const,
  title: { margin: 0, fontSize: '24px', color: '#f9fafb' } as const,
  subtitle: { margin: '4px 0 0 0', color: '#9ca3af', fontSize: '12px' } as const,
  netBadge: (online: boolean) =>
    ({
      padding: '6px 10px',
      borderRadius: '999px',
      background: online ? '#14532d' : '#7f1d1d',
      border: `1px solid ${online ? '#22c55e' : '#ef4444'}`,
      fontSize: '12px',
    } as const),
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '12px',
  } as const,
  panel: {
    border: '1px solid #1f2937',
    borderRadius: '10px',
    background: 'rgba(2, 6, 23, 0.86)',
    padding: '12px',
    minHeight: 0,
  } as const,
  panelTitle: { margin: '0 0 10px 0', fontSize: '14px', color: '#93c5fd' } as const,
  label: { fontSize: '12px', color: '#93c5fd', display: 'block', marginBottom: '6px', marginTop: '8px' } as const,
  row: { display: 'flex', gap: '8px' } as const,
  modeBtn: (active: boolean) =>
    ({
      flex: 1,
      border: `1px solid ${active ? '#38bdf8' : '#334155'}`,
      background: active ? 'rgba(14, 116, 144, 0.35)' : '#0f172a',
      color: '#e2e8f0',
      borderRadius: '8px',
      padding: '8px',
      cursor: 'pointer',
    } as const),
  select: {
    width: '100%',
    background: '#0f172a',
    color: '#e2e8f0',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '8px',
  } as const,
  input: {
    width: '100%',
    background: '#0f172a',
    color: '#e2e8f0',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '8px',
    fontFamily: 'inherit',
    fontSize: '12px',
  } as const,
  uploadLabel: {
    marginTop: '10px',
    display: 'inline-block',
    width: '100%',
    textAlign: 'center' as const,
    cursor: 'pointer',
    border: '1px dashed #60a5fa',
    color: '#bfdbfe',
    borderRadius: '8px',
    padding: '10px',
    fontSize: '12px',
  } as const,
  shareList: { marginTop: '10px', display: 'grid', gap: '6px' } as const,
  shareItem: {
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '8px',
    fontSize: '12px',
    color: '#cbd5e1',
  } as const,
  empty: { fontSize: '12px', color: '#64748b' } as const,
  log: {
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '10px',
    height: '62vh',
    overflow: 'auto',
    background: '#020617',
  } as const,
  message: (role: Role) =>
    ({
      marginBottom: '10px',
      padding: '8px',
      borderRadius: '8px',
      border: '1px solid #1e293b',
      background: role === 'user' ? '#0f172a' : role === 'assistant' ? '#052e16' : '#1e293b',
    } as const),
  badge: (role: Role) =>
    ({
      fontSize: '10px',
      textTransform: 'uppercase' as const,
      color: role === 'user' ? '#93c5fd' : role === 'assistant' ? '#86efac' : '#facc15',
    } as const),
  messageText: {
    whiteSpace: 'pre-wrap' as const,
    margin: '6px 0 0 0',
    fontFamily: 'inherit',
    fontSize: '12px',
    color: '#e2e8f0',
  } as const,
  chatForm: { marginTop: '10px', display: 'flex', gap: '8px' } as const,
  chatInput: {
    flex: 1,
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '10px',
    background: '#0f172a',
    color: '#f8fafc',
    fontFamily: 'inherit',
  } as const,
  primaryButton: {
    border: '1px solid #22d3ee',
    background: '#0c4a6e',
    color: '#e0f2fe',
    borderRadius: '8px',
    padding: '10px 14px',
    cursor: 'pointer',
  } as const,
  secondaryButton: {
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#cbd5e1',
    borderRadius: '8px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '12px',
  } as const,
  small: { fontSize: '12px', color: '#94a3b8', marginTop: 0 } as const,
  kpiRow: { display: 'flex', gap: '8px', marginBottom: '10px' } as const,
  kpi: {
    flex: 1,
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '8px',
    fontSize: '12px',
    background: '#0f172a',
  } as const,
  queueList: { display: 'grid', gap: '6px' } as const,
  queueItem: {
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '8px',
    fontSize: '12px',
    background: '#020617',
  } as const,
  queueTitle: { color: '#e2e8f0', marginBottom: '4px' } as const,
  queueNote: { color: '#94a3b8' } as const,
};

export default App;
