/**
 * Agent Dashboard — live view of all active agents.
 * Accessible at /dashboard from any device.
 */
export function getDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>XRAI Agent Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
      background: #0a0a0f;
      color: #e0e0e0;
      min-height: 100vh;
      padding: 20px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .header h1 {
      font-size: 18px;
      font-weight: 500;
      letter-spacing: 0.02em;
      color: rgba(255,255,255,0.7);
    }
    .header h1 span { color: #4dd0e1; }
    .pulse {
      width: 8px; height: 8px;
      background: #4dd0e1;
      border-radius: 50%;
      animation: live-pulse 2s ease-in-out infinite;
    }
    @keyframes live-pulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; box-shadow: 0 0 8px #4dd0e1; }
    }
    .status-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: rgba(255,255,255,0.4);
    }
    .agents-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 16px;
    }
    .agent-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px;
      padding: 16px;
      transition: border-color 0.3s;
    }
    .agent-card:hover {
      border-color: rgba(255,255,255,0.12);
    }
    .agent-card.working { border-left: 3px solid #4dd0e1; }
    .agent-card.blocked { border-left: 3px solid #ef5350; }
    .agent-card.done { border-left: 3px solid #66bb6a; }
    .agent-card.idle { border-left: 3px solid rgba(255,255,255,0.1); }
    .agent-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .agent-name {
      font-size: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .agent-type {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.4);
    }
    .agent-status {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 3px 8px;
      border-radius: 6px;
    }
    .agent-status.working { background: rgba(77,208,225,0.15); color: #4dd0e1; }
    .agent-status.blocked { background: rgba(239,83,80,0.15); color: #ef5350; }
    .agent-status.done { background: rgba(102,187,106,0.15); color: #66bb6a; }
    .agent-status.idle { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.3); }
    .agent-status.error { background: rgba(239,83,80,0.15); color: #ef5350; }
    .agent-task {
      font-size: 13px;
      color: rgba(255,255,255,0.6);
      margin-bottom: 10px;
      line-height: 1.4;
    }
    .progress-bar {
      height: 3px;
      background: rgba(255,255,255,0.06);
      border-radius: 2px;
      margin-bottom: 12px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: #4dd0e1;
      border-radius: 2px;
      transition: width 0.5s ease;
    }
    .todos {
      list-style: none;
      font-size: 12px;
      margin-bottom: 10px;
    }
    .todos li {
      padding: 3px 0;
      color: rgba(255,255,255,0.4);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .todos li.completed { text-decoration: line-through; opacity: 0.4; }
    .todos li.in_progress { color: #4dd0e1; }
    .todo-icon { font-size: 10px; }
    .agent-log {
      max-height: 100px;
      overflow-y: auto;
      font-size: 11px;
      font-family: 'SF Mono', Monaco, monospace;
      color: rgba(255,255,255,0.3);
      border-top: 1px solid rgba(255,255,255,0.04);
      padding-top: 8px;
      margin-top: 8px;
    }
    .agent-log div {
      padding: 1px 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .agent-meta {
      font-size: 11px;
      color: rgba(255,255,255,0.25);
      margin-top: 8px;
    }
    .empty {
      text-align: center;
      padding: 60px 20px;
      color: rgba(255,255,255,0.2);
    }
    .empty h2 { font-weight: 400; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <h1><span>XRAI</span> Agent Dashboard</h1>
    <div class="status-bar">
      <div class="pulse"></div>
      <span id="status">Connecting...</span>
    </div>
  </div>
  <div class="agents-grid" id="grid"></div>

  <script>
    const grid = document.getElementById('grid');
    const status = document.getElementById('status');
    let agents = new Map();

    function renderAgent(a) {
      const todoHtml = (a.todos || []).map(t =>
        '<li class="' + (t.status || '') + '">' +
        '<span class="todo-icon">' + (t.status === 'completed' ? '\\u2713' : t.status === 'in_progress' ? '\\u25B6' : '\\u25CB') + '</span>' +
        (t.status === 'in_progress' ? (t.activeForm || t.content) : t.content) +
        '</li>'
      ).join('');

      const logHtml = (a.log || []).map(l =>
        '<div>' + new Date(l.t).toLocaleTimeString() + ' ' + l.msg + '</div>'
      ).join('');

      const uptime = Math.floor((a.uptime || 0) / 60000);

      return '<div class="agent-card ' + a.status + '" id="agent-' + a.id + '">' +
        '<div class="agent-header">' +
          '<div class="agent-name">' + a.name + ' <span class="agent-type">' + a.type + '</span></div>' +
          '<span class="agent-status ' + a.status + '">' + a.status + '</span>' +
        '</div>' +
        (a.currentTask ? '<div class="agent-task">' + a.currentTask + '</div>' : '') +
        (a.progress > 0 ? '<div class="progress-bar"><div class="progress-fill" style="width:' + a.progress + '%"></div></div>' : '') +
        (todoHtml ? '<ul class="todos">' + todoHtml + '</ul>' : '') +
        (logHtml ? '<div class="agent-log">' + logHtml + '</div>' : '') +
        '<div class="agent-meta">' + uptime + 'm uptime</div>' +
      '</div>';
    }

    function renderAll() {
      if (agents.size === 0) {
        grid.innerHTML = '<div class="empty"><h2>No agents active</h2><p>Agents will appear here when they start working</p></div>';
        return;
      }
      grid.innerHTML = Array.from(agents.values()).map(renderAgent).join('');
    }

    // SSE connection
    function connect() {
      const es = new EventSource('/agent/dashboard/stream');

      es.onmessage = (e) => {
        const msg = JSON.parse(e.data);

        if (msg.type === 'snapshot') {
          agents.clear();
          for (const a of msg.agents) agents.set(a.id, a);
          renderAll();
          status.textContent = agents.size + ' agent' + (agents.size !== 1 ? 's' : '') + ' active';
        } else if (msg.type === 'agent:registered' || msg.type === 'agent:updated') {
          agents.set(msg.agent.id, msg.agent);
          renderAll();
          status.textContent = agents.size + ' agent' + (agents.size !== 1 ? 's' : '') + ' active';
        } else if (msg.type === 'agent:removed') {
          agents.delete(msg.agentId);
          renderAll();
          status.textContent = agents.size + ' agent' + (agents.size !== 1 ? 's' : '') + ' active';
        }
      };

      es.onerror = () => {
        status.textContent = 'Reconnecting...';
        es.close();
        setTimeout(connect, 3000);
      };
    }

    connect();
  </script>
</body>
</html>`;
}
