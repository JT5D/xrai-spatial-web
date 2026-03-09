import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Edge TTS proxy", () => {
  it("exports speak and listVoices", async () => {
    const mod = await import("../src/server/agent/edge-tts-proxy.mjs");
    assert.equal(typeof mod.speak, "function");
    assert.equal(typeof mod.listVoices, "function");
  });

  it("listVoices returns array of voice objects", async () => {
    const { listVoices } = await import("../src/server/agent/edge-tts-proxy.mjs");
    const voices = listVoices();
    assert.ok(Array.isArray(voices));
    assert.ok(voices.length >= 5);
    assert.ok(voices.every((v) => v.name && v.gender));
    assert.ok(voices.find((v) => v.name === "en-US-GuyNeural"));
  });

  it("speak returns Buffer for valid text", async () => {
    const { speak } = await import("../src/server/agent/edge-tts-proxy.mjs");
    const audio = await speak("Hello, I am Jarvis.");
    assert.ok(Buffer.isBuffer(audio), "Should return a Buffer");
    assert.ok(audio.length > 100, `Audio buffer should have content, got ${audio.length} bytes`);
    // MP3 starts with ID3 header or MPEG sync bytes
    const header = audio.slice(0, 3).toString("ascii");
    const isMP3 = header === "ID3" || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0);
    assert.ok(isMP3, `Should be MP3 format, got header: ${header}`);
  });

  it("speak returns empty buffer for empty text", async () => {
    const { speak } = await import("../src/server/agent/edge-tts-proxy.mjs");
    const audio = await speak("");
    assert.equal(audio.length, 0);
  });
});
