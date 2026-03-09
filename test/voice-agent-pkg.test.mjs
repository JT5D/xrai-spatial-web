import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createEventBus } from "../packages/voice-agent/event-bus.mjs";
import { TTS_PROVIDER, PROVIDER_PRIORITY } from "../packages/voice-agent/tts/provider-interface.mjs";

describe("voice-agent package", () => {
  describe("event-bus", () => {
    it("emits and receives events", () => {
      const bus = createEventBus();
      let received = null;
      bus.on("test", (data) => { received = data; });
      bus.emit("test", { hello: "world" });
      assert.deepEqual(received, { hello: "world" });
    });

    it("supports multiple listeners", () => {
      const bus = createEventBus();
      let count = 0;
      bus.on("inc", () => count++);
      bus.on("inc", () => count++);
      bus.emit("inc");
      assert.equal(count, 2);
    });

    it("unsubscribes via returned function", () => {
      const bus = createEventBus();
      let count = 0;
      const unsub = bus.on("x", () => count++);
      bus.emit("x");
      assert.equal(count, 1);
      unsub();
      bus.emit("x");
      assert.equal(count, 1);
    });

    it("off removes by event name", () => {
      const bus = createEventBus();
      let count = 0;
      bus.on("y", () => count++);
      bus.emit("y");
      assert.equal(count, 1);
      bus.off("y");
      bus.emit("y");
      assert.equal(count, 1);
    });

    it("dispose clears all listeners", () => {
      const bus = createEventBus();
      let count = 0;
      bus.on("a", () => count++);
      bus.on("b", () => count++);
      bus.dispose();
      bus.emit("a");
      bus.emit("b");
      assert.equal(count, 0);
    });

    it("swallows listener errors", () => {
      const bus = createEventBus();
      let ok = false;
      bus.on("err", () => { throw new Error("boom"); });
      bus.on("err", () => { ok = true; });
      bus.emit("err");
      assert.ok(ok);
    });
  });

  describe("provider-interface", () => {
    it("defines three providers", () => {
      assert.equal(TTS_PROVIDER.ELEVENLABS, "elevenlabs");
      assert.equal(TTS_PROVIDER.EDGE, "edge-tts");
      assert.equal(TTS_PROVIDER.WEB_SPEECH, "web-speech");
    });

    it("priority is ElevenLabs > Edge > WebSpeech", () => {
      assert.deepEqual(PROVIDER_PRIORITY, ["elevenlabs", "edge-tts", "web-speech"]);
    });
  });

  describe("voice-input (no browser)", () => {
    it("returns noop when SpeechRecognition unavailable", async () => {
      const bus = createEventBus();
      const { createVoiceInput } = await import("../packages/voice-agent/voice-input.mjs");
      const input = createVoiceInput(bus);
      assert.equal(input.getMode(), "off");
      assert.equal(input.isSupported(), false);
      assert.equal(input.isListening(), false);
      input.start();
      input.stop();
      input.toggle();
      input.dispose();
    });
  });

  describe("voice-output (no browser)", () => {
    it("returns noop when no window", async () => {
      const bus = createEventBus();
      const { createVoiceOutput } = await import("../packages/voice-agent/voice-output.mjs");
      const output = createVoiceOutput(bus);
      assert.equal(output.getProvider(), null);
      assert.deepEqual(output.listProviders(), []);
      output.speak("test");
      output.stop();
      output.dispose();
    });
  });
});
