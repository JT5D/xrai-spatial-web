/**
 * Agent Registry — tracks all active agents/sessions and their status.
 * Powers the dashboard: see what every agent is doing in real-time.
 *
 * Each agent has:
 *   id, name, status, currentTask, progress, startedAt, lastActivity, todos[]
 *
 * This is the server-side state. The dashboard reads it via /agent/dashboard API.
 * Claude Code sessions, background tasks, research agents all register here.
 */

let nextId = 1;

export function createAgentRegistry() {
  const agents = new Map(); // agentId → AgentEntry
  const listeners = new Set(); // SSE/WS listeners for real-time updates

  function register(opts = {}) {
    const id = `agent-${nextId++}`;
    const entry = {
      id,
      name: opts.name || `Agent ${id}`,
      type: opts.type || "general",    // "research", "build", "test", "review", "voice"
      status: "idle",                   // "idle", "working", "blocked", "done", "error"
      currentTask: null,
      progress: 0,                      // 0-100
      todos: [],
      log: [],                          // recent activity log (last 50 entries)
      startedAt: Date.now(),
      lastActivity: Date.now(),
      meta: opts.meta || {},
    };
    agents.set(id, entry);
    broadcast({ type: "agent:registered", agent: snapshot(entry) });
    return id;
  }

  function update(agentId, updates) {
    const entry = agents.get(agentId);
    if (!entry) return;

    if (updates.status) entry.status = updates.status;
    if (updates.currentTask !== undefined) entry.currentTask = updates.currentTask;
    if (updates.progress !== undefined) entry.progress = updates.progress;
    if (updates.todos) entry.todos = updates.todos;
    if (updates.meta) Object.assign(entry.meta, updates.meta);
    entry.lastActivity = Date.now();

    // Log the activity
    if (updates.log) {
      entry.log.push({ t: Date.now(), msg: updates.log });
      if (entry.log.length > 50) entry.log.shift();
    }

    broadcast({ type: "agent:updated", agent: snapshot(entry) });
  }

  function remove(agentId) {
    agents.delete(agentId);
    broadcast({ type: "agent:removed", agentId });
  }

  function getAll() {
    return Array.from(agents.values()).map(snapshot);
  }

  function get(agentId) {
    const entry = agents.get(agentId);
    return entry ? snapshot(entry) : null;
  }

  function snapshot(entry) {
    return {
      id: entry.id,
      name: entry.name,
      type: entry.type,
      status: entry.status,
      currentTask: entry.currentTask,
      progress: entry.progress,
      todos: entry.todos,
      log: entry.log.slice(-10),
      startedAt: entry.startedAt,
      lastActivity: entry.lastActivity,
      uptime: Date.now() - entry.startedAt,
      meta: entry.meta,
    };
  }

  /** Add an SSE/WS listener for real-time updates */
  function subscribe(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
  }

  function broadcast(event) {
    const json = JSON.stringify(event);
    for (const cb of listeners) {
      try { cb(json); } catch { /* listener error */ }
    }
  }

  return { register, update, remove, getAll, get, subscribe };
}
