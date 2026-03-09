/**
 * Presence WebSocket — handles multiplayer real-time sync.
 *
 * Protocol (JSON messages):
 *   → { type: "join", roomId?, name? }           — join/create room
 *   ← { type: "joined", roomId, peerId, state }  — confirmation + initial state
 *   ← { type: "peer-joined", peer }              — another peer joined
 *   ← { type: "peer-left", peerId }              — another peer left
 *   → { type: "cursor", x, y, z }                — update cursor position
 *   ← { type: "cursors", peers: [...] }          — broadcast all cursor positions
 *   → { type: "view-change", mode }              — switch view mode for room
 *   ← { type: "view-changed", mode, by }         — broadcast view change
 *   → { type: "filter-change", filters }         — update filters for room
 *   ← { type: "filters-changed", filters, by }   — broadcast filter change
 *
 * Attaches to existing HTTP server via ws upgrade on /rooms path.
 */

import { WebSocketServer } from "ws";

export function createPresenceWS(server, roomManager) {
  const wss = new WebSocketServer({ noServer: true });
  const peerSockets = new Map(); // `${roomId}:${peerId}` → ws

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/rooms") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
    // Don't handle other paths — let agent-ws handle /agent
  });

  wss.on("connection", (ws) => {
    let roomId = null;
    let peerId = null;

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (msg.type) {
        case "join": {
          const result = roomManager.join(msg.roomId, msg.name);
          roomId = result.roomId;
          peerId = result.peerId;
          peerSockets.set(`${roomId}:${peerId}`, ws);

          // Send state to joiner
          ws.send(JSON.stringify({
            type: "joined",
            roomId,
            peerId,
            state: result.state,
          }));

          // Notify others in room
          broadcast(roomId, peerId, {
            type: "peer-joined",
            peer: roomManager.getRoom(roomId).getPeer(peerId),
            peerId,
          });
          break;
        }

        case "cursor": {
          if (!roomId || !peerId) return;
          const room = roomManager.getRoom(roomId);
          if (!room) return;
          room.updateCursor(peerId, { x: msg.x, y: msg.y, z: msg.z });

          // Broadcast cursor positions (throttled by client)
          broadcast(roomId, peerId, {
            type: "cursors",
            peers: room.snapshot().peers,
          });
          break;
        }

        case "view-change": {
          if (!roomId || !peerId) return;
          const room = roomManager.getRoom(roomId);
          if (!room) return;
          room.setViewMode(msg.mode);
          broadcast(roomId, null, {
            type: "view-changed",
            mode: msg.mode,
            by: peerId,
          });
          break;
        }

        case "filter-change": {
          if (!roomId || !peerId) return;
          const room = roomManager.getRoom(roomId);
          if (!room) return;
          room.setFilters(msg.filters);
          broadcast(roomId, null, {
            type: "filters-changed",
            filters: msg.filters,
            by: peerId,
          });
          break;
        }
      }
    });

    ws.on("close", () => {
      if (roomId && peerId) {
        peerSockets.delete(`${roomId}:${peerId}`);
        roomManager.leave(roomId, peerId);
        broadcast(roomId, peerId, { type: "peer-left", peerId });
      }
    });
  });

  /** Send message to all peers in a room, optionally excluding one */
  function broadcast(roomId, excludePeerId, msg) {
    const json = JSON.stringify(msg);
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    for (const peer of room.snapshot().peers) {
      if (peer.id === excludePeerId) continue;
      const ws = peerSockets.get(`${roomId}:${peer.id}`);
      if (ws?.readyState === 1) ws.send(json);
    }
  }

  return { wss };
}
