import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleGenAI } from '@google/genai';

type Role = 'user' | 'assistant' | 'system';

type ChatMessage = { id: string; role: Role; text: string; createdAt: number };
type QueueJob = { id: string; prompt: string; status: 'pending' | 'running' | 'completed'; note: string };
type SharedBundle = { id: string; recipient: string; files: number; bytes: number };
type ShellLine = { id: string; kind: 'input' | 'output' | 'error'; text: string };
type MemoryTemplate = {
  id: string;
  title: string;
  topic: string;
  createdBy: string;
  files: Record<string, string>;
  usageCount: number;
};

const LS_FILES = 'cp.files.v1';
const LS_MEMORY = 'cp.memory.v1';
const LS_SHELL = 'cp.shell.v1';
const LS_PACKS = 'cp.packs.v1';
const TWO_GB = 2 * 1024 * 1024 * 1024;

const DEFAULT_FILES: Record<string, string> = {
  'index.html': `<!doctype html>\n<html>\n<head>\n<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width,initial-scale=1" />\n<title>Codepoint Preview</title>\n<link rel="stylesheet" href="style.css" />\n</head>\n<body>\n<main id="app"></main>\n<script src="script.js"></script>\n</body>\n</html>`,
  'style.css': 'body{margin:0;font-family:Arial;background:#0b1220;color:#fff}#app{padding:24px}',
  'script.js': "document.getElementById('app').innerHTML='<h1>Chat AGI</h1><p>Preview from browser storage.</p>';",
};

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gpt-4.1', 'claude-sonnet-4'];
const SYSTEM = 'You are Chat AGI. Be practical and implementation-focused.';
const rid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const readJSON = <T,>(k: string, f: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : f;
  } catch {
    return f;
  }
};

const fmt = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

const ignored = (path: string) => {
  const p = path.replace(/\\/g, '/');
  return p.includes('/.git/') || p.startsWith('.git/') || p === '.gitignore' || p.endsWith('/.gitignore') || p.includes('/node_modules/') || p.startsWith('node_modules/');
};

const tok = (s: string) => (s.match(/(?:[^\s"]+|"[^"]*")+/g) || []).map((x) => x.replace(/^"|"$/g, ''));

const previewDoc = (files: Record<string, string>) => {
  let html = files['index.html'] || '<html><body><h1>No index.html</h1></body></html>';
  const css = files['style.css'] || '';
  const js = files['script.js'] || '';
  if (css) html = html.includes('</head>') ? html.replace('</head>', `<style>${css}</style></head>`) : `<style>${css}</style>${html}`;
  if (js) html = html.includes('</body>') ? html.replace('</body>', `<script>${js}<\/script></body>`) : `${html}<script>${js}<\/script>`;
  return html;
};

const score = (a: string, b: string) => {
  const x = a.toLowerCase().split(/\W+/).filter(Boolean);
  const y = b.toLowerCase().split(/\W+/).filter(Boolean);
  return y.reduce((n, t) => (x.includes(t) ? n + 1 : n), 0);
};

const callModel = async (model: string, prompt: string, mode: 'reciprocal' | 'prospect') => {
  const apiKey = (typeof process !== 'undefined' && (process.env?.GEMINI_API_KEY || process.env?.API_KEY)) || '';
  if (!apiKey) return `Local mode: missing API key. Prepared plan for "${prompt}" (${mode}).`;
  const ai = new GoogleGenAI({ apiKey });
  const res = await ai.models.generateContent({
    model: model.startsWith('gemini') ? model : 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: `Mode=${mode}. ${prompt}` }] }],
    config: { systemInstruction: SYSTEM },
  });
  return res.text || 'No response';
};

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: rid(), role: 'assistant', text: 'Chat AGI ready. Right panel has shell + memory recall.', createdAt: Date.now() }]);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [mode, setMode] = useState<'reciprocal' | 'prospect'>('reciprocal');
  const [models, setModels] = useState(MODELS);
  const [activeModel, setActiveModel] = useState(MODELS[0]);
  const [newModel, setNewModel] = useState('');

  const [queue, setQueue] = useState<QueueJob[]>([]);
  const [shareRecipient, setShareRecipient] = useState('Codepoint 2.1');
  const [shares, setShares] = useState<SharedBundle[]>([]);

  const [files, setFiles] = useState<Record<string, string>>(() => readJSON(LS_FILES, DEFAULT_FILES));
  const [activeFile, setActiveFile] = useState('index.html');
  const [draft, setDraft] = useState('');
  const [newFile, setNewFile] = useState('');
  const [packs, setPacks] = useState<string[]>(() => readJSON(LS_PACKS, []));

  const [shell, setShell] = useState<ShellLine[]>(() => readJSON(LS_SHELL, [{ id: rid(), kind: 'output', text: 'Shell ready. Type help' }]));
  const [shellInput, setShellInput] = useState('');

  const [memory, setMemory] = useState<MemoryTemplate[]>(() => readJSON(LS_MEMORY, []));
  const [memTopic, setMemTopic] = useState('food website');
  const [memUser, setMemUser] = useState('User 1');
  const [selectedMem, setSelectedMem] = useState('');
  const [targetTopic, setTargetTopic] = useState('travel website');
  const [targetUser, setTargetUser] = useState('User 2');

  const chatEnd = useRef<HTMLDivElement | null>(null);
  const shellEnd = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraft(files[activeFile] || '');
  }, [activeFile, files]);

  useEffect(() => {
    localStorage.setItem(LS_FILES, JSON.stringify(files));
  }, [files]);
  useEffect(() => {
    localStorage.setItem(LS_SHELL, JSON.stringify(shell.slice(-200)));
  }, [shell]);
  useEffect(() => {
    localStorage.setItem(LS_MEMORY, JSON.stringify(memory));
  }, [memory]);
  useEffect(() => {
    localStorage.setItem(LS_PACKS, JSON.stringify(packs));
  }, [packs]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  useEffect(() => {
    shellEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [shell]);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => {
    if (!online) return;
    const job = queue.find((q) => q.status === 'pending');
    if (!job) return;
    const run = async () => {
      setQueue((p) => p.map((q) => (q.id === job.id ? { ...q, status: 'running', note: 'running workflow' } : q)));
      await new Promise((r) => setTimeout(r, 700));
      const commit = `cp1-${Math.random().toString(36).slice(2, 8)}`;
      setFiles((p) => ({ ...p, '.codepoint/workflow-log.md': `${p['.codepoint/workflow-log.md'] || '# Workflow Log\n'}- ${new Date().toISOString()} ${commit} ${job.prompt}\n` }));
      setQueue((p) => p.map((q) => (q.id === job.id ? { ...q, status: 'completed', note: `auto-commit ${commit}` } : q)));
      setMessages((p) => [...p, { id: rid(), role: 'system', text: `Queued task executed: ${job.prompt}`, createdAt: Date.now() }]);
    };
    void run();
  }, [online, queue]);

  const preview = useMemo(() => previewDoc(files), [files]);
  const selected = useMemo(() => memory.find((m) => m.id === selectedMem) || null, [memory, selectedMem]);
  const suggestions = useMemo(
    () => [...memory].map((m) => ({ m, s: score(targetTopic, m.topic) })).sort((a, b) => b.s - a.s).filter((x) => x.s > 0).slice(0, 3).map((x) => x.m),
    [memory, targetTopic],
  );

  const say = (role: Role, text: string) => setMessages((p) => [...p, { id: rid(), role, text, createdAt: Date.now() }]);
  const line = (kind: ShellLine['kind'], text: string) => setShell((p) => [...p, { id: rid(), kind, text }]);

  const exec = (cmdRaw: string) => {
    const c = cmdRaw.trim();
    if (!c) return;
    line('input', `$ ${c}`);
    const [name, ...a] = tok(c);
    const cmd = (name || '').toLowerCase();
    if (cmd === 'clear') return setShell([]);
    if (cmd === 'help') return line('output', 'help | ls | cat <file> | open <file> | touch <file> | write <file> <text> | append <file> <text> | rm <file> | npm init | npm install <pkg> | npm run dev|build|preview | preview');
    if (cmd === 'ls') return line('output', Object.keys(files).sort().join('\n') || 'No files');
    if (cmd === 'cat') {
      if (!a[0]) return line('error', 'Usage: cat <file>');
      if (!(a[0] in files)) return line('error', `File not found: ${a[0]}`);
      return line('output', files[a[0]]);
    }
    if (cmd === 'open') {
      if (!a[0]) return line('error', 'Usage: open <file>');
      if (!(a[0] in files)) return line('error', `File not found: ${a[0]}`);
      setActiveFile(a[0]);
      return line('output', `Opened ${a[0]}`);
    }
    if (cmd === 'touch') {
      if (!a[0]) return line('error', 'Usage: touch <file>');
      setFiles((p) => ({ ...p, [a[0]]: p[a[0]] ?? '' }));
      return line('output', `Created ${a[0]}`);
    }
    if (cmd === 'write' || cmd === 'append') {
      const f = a[0];
      const t = a.slice(1).join(' ').replace(/\\n/g, '\n');
      if (!f || !t) return line('error', `Usage: ${cmd} <file> <text>`);
      setFiles((p) => ({ ...p, [f]: cmd === 'append' ? `${p[f] || ''}${t}` : t }));
      return line('output', `${cmd === 'append' ? 'Updated' : 'Wrote'} ${f}`);
    }
