/**
 * ElevenLabs TTS provider — premium neural voices via server proxy.
 * Requires ELEVENLABS_API_KEY on server. Configurable server URL.
 */
export function createElevenLabsProvider(bus, opts = {}) {
  if (typeof window === "undefined") return null;

  const baseUrl = opts.baseUrl || "";
  let audio = null;
  let speaking = false;
  let available = null;

  async function checkAvailable() {
    if (available !== null) return available;
    try {
      const res = await fetch(`${baseUrl}/agent/tts/elevenlabs/voices`);
      available = res.ok;
    } catch { available = false; }
    return available;
  }

  return {
    name: "elevenlabs",
    async speak(text) {
      if (!text?.trim()) return;
      if (!(await checkAvailable())) {
        bus.emit("agent:tts-error", { provider: "elevenlabs", error: "not configured" });
        return;
      }
      if (audio) { audio.pause(); audio = null; }
      speaking = true;
      bus.emit("agent:speaking", true);

      try {
        const res = await fetch(`${baseUrl}/agent/tts/elevenlabs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        audio = new Audio(url);
        audio.onended = () => {
          speaking = false;
          URL.revokeObjectURL(url);
          bus.emit("agent:speaking", false);
          bus.emit("agent:spoken");
        };
        audio.onerror = () => {
          speaking = false;
          URL.revokeObjectURL(url);
          bus.emit("agent:speaking", false);
          bus.emit("agent:tts-error", { provider: "elevenlabs", error: "playback failed" });
        };
        audio.play();
      } catch (err) {
        speaking = false;
        bus.emit("agent:speaking", false);
        bus.emit("agent:tts-error", { provider: "elevenlabs", error: err.message });
      }
    },
    stop() {
      if (audio) { audio.pause(); audio = null; }
      speaking = false;
      bus.emit("agent:speaking", false);
    },
    isSpeaking() { return speaking; },
    dispose() { if (audio) { audio.pause(); audio = null; } },
  };
}
