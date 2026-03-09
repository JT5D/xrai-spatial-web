import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRoomManager } from "../src/server/multiplayer/room-manager.mjs";
import { createRoomState } from "../src/server/multiplayer/room-state.mjs";

describe("room-state", () => {
  it("tracks peers with colors", () => {
    const room = createRoomState("test-room");
    const p1 = room.addPeer("Alice");
    const p2 = room.addPeer("Bob");

    assert.equal(room.getPeerCount(), 2);
    assert.equal(room.getPeer(p1).name, "Alice");
    assert.equal(room.getPeer(p2).name, "Bob");
    assert.notEqual(room.getPeer(p1).color, room.getPeer(p2).color);
  });

  it("removes peers", () => {
    const room = createRoomState("test-room");
    const p1 = room.addPeer("Alice");
    room.addPeer("Bob");

    room.removePeer(p1);
    assert.equal(room.getPeerCount(), 1);
    assert.equal(room.getPeer(p1), undefined);
  });

  it("updates cursor positions", () => {
    const room = createRoomState("test-room");
    const p1 = room.addPeer("Alice");

    room.updateCursor(p1, { x: 10, y: 20, z: 30 });
    assert.deepEqual(room.getPeer(p1).cursor, { x: 10, y: 20, z: 30 });
  });

  it("produces a snapshot", () => {
    const room = createRoomState("test-room");
    room.addPeer("Alice");
    room.setViewMode("media-city");
    room.setFilters({ type: ["heading"] });

    const snap = room.snapshot();
    assert.equal(snap.roomId, "test-room");
    assert.equal(snap.viewMode, "media-city");
    assert.deepEqual(snap.filters, { type: ["heading"] });
    assert.equal(snap.peers.length, 1);
    assert.equal(snap.peers[0].name, "Alice");
  });
});

describe("room-manager", () => {
  it("creates rooms", () => {
    const mgr = createRoomManager();
    const id = mgr.create("room-1");
    assert.equal(id, "room-1");
    assert.ok(mgr.getRoom("room-1"));
  });

  it("joins auto-creates rooms", () => {
    const mgr = createRoomManager();
    const { roomId, peerId, state } = mgr.join("room-2", "Alice");
    assert.equal(roomId, "room-2");
    assert.ok(peerId);
    assert.equal(state.peers.length, 1);
    assert.equal(state.peers[0].name, "Alice");
  });

  it("multiple peers join the same room", () => {
    const mgr = createRoomManager();
    mgr.join("room-3", "Alice");
    const { state } = mgr.join("room-3", "Bob");
    assert.equal(state.peers.length, 2);
  });

  it("leaving reduces peer count", () => {
    const mgr = createRoomManager();
    const { peerId: p1 } = mgr.join("room-4", "Alice");
    mgr.join("room-4", "Bob");

    mgr.leave("room-4", p1);
    assert.equal(mgr.getRoom("room-4").getPeerCount(), 1);
  });

  it("lists active rooms", () => {
    const mgr = createRoomManager();
    mgr.join("room-a", "Alice");
    mgr.join("room-b", "Bob");

    const rooms = mgr.listRooms();
    assert.equal(rooms.length, 2);
    assert.ok(rooms.find((r) => r.roomId === "room-a"));
    assert.ok(rooms.find((r) => r.roomId === "room-b"));
  });

  it("destroys rooms", () => {
    const mgr = createRoomManager();
    mgr.create("room-x");
    mgr.destroy("room-x");
    assert.equal(mgr.getRoom("room-x"), null);
  });
});
