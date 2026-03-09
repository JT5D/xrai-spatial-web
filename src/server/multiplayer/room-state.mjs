/**
 * Room State — shared state model for a multiplayer room.
 *
 * Tracks: connected peers, current view mode, filter state,
 * cursor positions, and shared graph data reference.
 * Transport-agnostic — no WebSocket code here.
 */

let nextPeerId = 1;

export function createRoomState(roomId) {
  const peers = new Map(); // peerId → { name, color, cursor, joinedAt }
  let viewMode = "force-graph";
  let filters = {};
  let graphUrl = null;

  const COLORS = [
    "#4fc3f7", "#ef5350", "#66bb6a", "#ab47bc", "#ffca28",
    "#ff7043", "#26c6da", "#ec407a", "#8d6e63", "#78909c",
  ];

  function addPeer(name) {
    const id = `p${nextPeerId++}`;
    peers.set(id, {
      name: name || `Guest ${id}`,
      color: COLORS[peers.size % COLORS.length],
      cursor: { x: 0, y: 0, z: 0 },
      joinedAt: Date.now(),
    });
    return id;
  }

  function removePeer(peerId) {
    peers.delete(peerId);
  }

  function updateCursor(peerId, pos) {
    const peer = peers.get(peerId);
    if (peer) peer.cursor = pos;
  }

  function setViewMode(mode) {
    viewMode = mode;
  }

  function setFilters(f) {
    filters = f;
  }

  function setGraphUrl(url) {
    graphUrl = url;
  }

  function snapshot() {
    return {
      roomId,
      viewMode,
      filters,
      graphUrl,
      peers: Array.from(peers.entries()).map(([id, p]) => ({
        id, name: p.name, color: p.color, cursor: p.cursor,
      })),
    };
  }

  return {
    roomId,
    addPeer, removePeer, updateCursor,
    setViewMode, setFilters, setGraphUrl,
    snapshot,
    getPeerCount: () => peers.size,
    getPeer: (id) => peers.get(id),
  };
}
