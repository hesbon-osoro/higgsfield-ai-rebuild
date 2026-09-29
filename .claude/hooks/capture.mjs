#!/usr/bin/env node
// Agent capture hook for Claude Code (8x assignment).
//
// Wired to UserPromptSubmit and Stop in .claude/settings.json, so it runs on
// every prompt and at the end of every turn without anyone remembering to.
//
// Each run rebuilds .agent-logs/<first-prompt-time>_<session-id>.md for every
// Claude Code session that ran in this repo, straight from the raw session
// transcripts (~/.claude/projects/<project>/<session>.jsonl). Per turn it keeps
// only the human prompt (verbatim) and the final assistant text for that turn:
// no thinking, no tool calls, no intermediate narration. It only writes files;
// committing them is left to the normal branch -> PR -> merge flow.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TOOL = 'claude-code';

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function git(repo, args) {
  try {
    return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function githubHandle(repo) {
  const url = git(repo, ['remote', 'get-url', 'origin']);
  const m = url.match(/github\.com[:/]([^/]+)\//);
  return m ? m[1] : git(repo, ['config', 'user.name']) || 'unknown';
}

function readJsonl(file) {
  const out = [];
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // a half-written trailing line; the next run will pick it up
    }
  }
  return out;
}

const SKIP_BLOCK = /^\s*<(system-reminder|ide_opened_file)>/;

// The verbatim text of a human prompt, or null if this user entry is not one
// (tool results, compaction summaries, meta/injected messages, interrupts).
function promptText(entry) {
  if (entry.type !== 'user' || entry.isSidechain || entry.isMeta || entry.isCompactSummary) return null;
  if (entry.origin && entry.origin.kind && entry.origin.kind !== 'human') return null;
  const content = entry.message && entry.message.content;
  if (typeof content === 'string') {
    return /^\[Request interrupted by user/.test(content) ? null : content;
  }
  if (!Array.isArray(content) || content.some((b) => b.type === 'tool_result')) return null;
  const parts = [];
  for (const b of content) {
    if (b.type === 'text' && !SKIP_BLOCK.test(b.text)) parts.push(b.text);
    else if (b.type === 'image') parts.push('[image attached]');
    else if (b.type === 'document') parts.push('[document attached]');
  }
  const text = parts.join('\n\n');
  if (!text.trim() || /^\[Request interrupted by user/.test(text)) return null;
  return text;
}

function parseSession(entries) {
  const seen = new Set();
  const turns = [];
  let turn = null;
  let lastModel = null;
  for (const e of entries) {
    if (e.uuid) {
      if (seen.has(e.uuid)) continue;
      seen.add(e.uuid);
    }
    if (e.isSidechain) continue;
    const prompt = promptText(e);
    if (prompt !== null) {
      turn = { prompt, promptTime: e.timestamp, texts: [], responseTime: null, model: null };
      turns.push(turn);
      continue;
    }
    if (!turn || e.type !== 'assistant' || !e.message) continue;
    const model = e.message.model;
    if (model && model !== '<synthetic>') {
      turn.model = model;
      lastModel = model;
    }
    for (const b of e.message.content || []) {
      // Anything said before the last tool call is intermediate narration;
      // the final response is the text after the turn's last tool call.
      if (b.type === 'tool_use') turn.texts = [];
      else if (b.type === 'text' && b.text.trim()) {
        turn.texts.push(b.text);
        turn.responseTime = e.timestamp;
      }
    }
  }
  return { turns, lastModel };
}

function fileStamp(iso) {
  return iso.slice(0, 19).replace('T', '_').replace(/:/g, '-');
}

function render({ sessionId, turns, author, project }) {
  const short = sessionId.slice(0, 8);
  const models = [...new Set(turns.map((t) => t.model).filter(Boolean))];
  const first = turns[0].promptTime;
  const last = turns[turns.length - 1].promptTime;
  const lines = [
    '---',
    `session_id: ${sessionId}`,
    `date: ${first.slice(0, 10)}`,
    `author: ${author}`,
    `model: ${models.join(', ') || 'unknown'}`,
    `tool: ${TOOL}`,
    `project: ${project}`,
    `total_exchanges: ${turns.length}`,
    `first_prompt_time: ${first}`,
    `last_prompt_time: ${last}`,
    '---',
    '',
    `# Session Log - ${first.slice(0, 10)}`,
    '',
    `Session: \`${short}\` | Project: \`${project}\` | Author: \`${author}\``,
    '',
    '---',
    '',
  ];
  turns.forEach((t, i) => {
    const n = i + 1;
    lines.push(`[LOG_ENTRY type=PROMPT num=${n} session=${short}]`);
    lines.push(`timestamp: ${t.promptTime}`);
    lines.push(`model: ${t.promptModel}`);
    lines.push('');
    lines.push(t.prompt);
    lines.push('', '');
    if (t.texts.length) {
      lines.push(`[LOG_ENTRY type=RESPONSE num=${n} session=${short}]`);
      lines.push(`timestamp: ${t.responseTime}`);
      lines.push(`model: ${t.model || t.promptModel}`);
      lines.push('');
      lines.push(t.texts.join('\n\n'));
      lines.push('', '');
    }
  });
  return lines.join('\n').replace(/\n+$/, '\n');
}

function sessionCwd(entries) {
  const e = entries.find((x) => x.cwd);
  return e ? e.cwd : null;
}

function inside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function main() {
  const input = readStdin();
  const repo = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const transcriptPath = input.transcript_path;
  if (!transcriptPath) return;
  const logDir = path.join(repo, '.agent-logs');
  fs.mkdirSync(logDir, { recursive: true });

  const author = githubHandle(repo);
  const project = path.basename(repo);
  const dir = path.dirname(transcriptPath);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(dir, f));
  if (!files.includes(transcriptPath)) files.push(transcriptPath);

  // The Stop hook can fire a beat before the final message is flushed to the
  // transcript; give it a moment rather than logging a turn with no response.
  if (input.hook_event_name === 'Stop') {
    for (let i = 0; i < 10; i++) {
      const { turns } = parseSession(readJsonl(transcriptPath));
      const last = turns[turns.length - 1];
      if (!last || last.texts.length) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
    }
  }

  for (const file of files) {
    const entries = readJsonl(file);
    const cwd = sessionCwd(entries);
    if (cwd && !inside(cwd, repo)) continue;
    const sessionId = path.basename(file, '.jsonl');
    const { turns, lastModel } = parseSession(entries);

    // On UserPromptSubmit the new prompt is not in the transcript yet.
    if (file === transcriptPath && input.hook_event_name === 'UserPromptSubmit' && typeof input.prompt === 'string') {
      const lastTurn = turns[turns.length - 1];
      if (!lastTurn || lastTurn.prompt !== input.prompt) {
        turns.push({ prompt: input.prompt, promptTime: new Date().toISOString(), texts: [], responseTime: null, model: null });
      }
    }
    if (!turns.length) continue;

    let running = null;
    for (const t of turns) {
      t.promptModel = t.model || running || lastModel || process.env.ANTHROPIC_MODEL || 'unknown';
      running = t.model || running;
    }

    const out = path.join(logDir, `${fileStamp(turns[0].promptTime)}_${sessionId}.md`);
    const body = render({ sessionId, turns, author, project });
    let prev = null;
    try {
      prev = fs.readFileSync(out, 'utf8');
    } catch {}
    if (prev !== body) fs.writeFileSync(out, body);
  }
}

try {
  main();
} catch (err) {
  // Never block the user's turn; leave a trace outside the committed tree.
  try {
    const repo = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    fs.appendFileSync(path.join(repo, '.git', 'agent-capture-errors.log'), `${new Date().toISOString()} ${err && err.stack}\n`);
  } catch {}
}
process.exit(0);
