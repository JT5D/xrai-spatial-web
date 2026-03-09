/**
 * Room Manager — creates, joins, and manages multiplayer rooms.
 *
 * Zero-cost: pure in-memory, no external services.
 * Rooms auto-expire after all peers disconnect (with a grace period).
 */

import { createRoomState } from "./room-state.mjs";

const GRACE_PERIOD_MS = 30_000; // 30s before empty room is destroyed

export function createRoomManager() {
  const rooms = new Map(); // roomId → { state, timeoutId }

  /** Create a new room, returns room ID */
  function create(roomId) {
    const id = roomId || randomId();
    if (rooms.has(id)) return id; // already exists

    rooms.set(id, { state: createRoomState(id), timeoutId: null });
    return id;
  }

  /** Join a room (auto-creates if needed). Returns { roomId, peerId, state } */
  function join(roomId, peerName) {
    const id = roomId || create();
    if (!rooms.has(id)) create(id);

    const room = rooms.get(id);
    // Cancel destruction timer if set
    if (room.timeoutId) {
      clearTimeout(room.timeoutId);
      room.timeoutId = null;
    }

    const peerId = room.state.addPeer(peerName);
    return { roomId: id, peerId, state: room.state.snapshot() };
  }

  /** Leave a room. Returns true if room still exists. */
  function leave(roomId, peerId) {
    const room = rooms.get(roomId);
    if (!room) return false;

    room.state.removePeer(peerId);

    if (room.state.getPeerCount() === 0) {
      // Start grace timer
      room.timeoutId = setTimeout(() => {
        rooms.delete(roomId);
      }, GRACE_PERIOD_MS);
    }

    return rooms.has(roomId);
  }

  /** Get room state */
  function getRoom(roomId) {
    return rooms.get(roomId)?.state || null;
  }

  /** List active rooms */
  function listRooms() {
    return Array.from(rooms.values()).map((r) => ({
      roomId: r.state.roomId,
      peers: r.state.getPeerCount(),
    }));
  }

  /** Destroy a room */
  function destroy(roomId) {
    const room = rooms.get(roomId);
    if (room?.timeoutId) clearTimeout(room.timeoutId);
    rooms.delete(roomId);
  }

  return { create, join, leave, getRoom, listRooms, destroy };
}

function randomId() {
  return Math.random().toString(36).slice(2, 8);
}
