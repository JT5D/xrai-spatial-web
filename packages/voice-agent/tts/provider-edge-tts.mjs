/**
 * Edge TTS provider — natural neural voices via server proxy.
 * No API key needed. Configurable server URL.
 */
export function createEdgeTTSProvider(bus, opts = {}) {
  if (typeof window === "undefined") return null;

  const baseUrl = opts.baseUrl || "";
  const voice = opts.voice || "en-US-GuyNeural";
  let currentAudio = null;
  let speaking = false;

  async function speak(text) {
    if (!text?.trim()) return;
    stop();
    speaking = true;
    bus.emit("agent:speaking", true);

    try {
      const res = await fetch(`${baseUrl}/agent/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
      });
      if (!res.ok) throw new Error(`TTS server returned ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      currentAudio = new Audio(url);
      currentAudio.onended = () => {
        speaking = false;
        bus.emit("agent:speaking", false);
        bus.emit("agent:spoken");
        URL.revokeObjectURL(url);
        currentAudio = null;
      };
      currentAudio.onerror = () => {
        speaking = false;
        bus.emit("agent:speaking", false);
        URL.revokeObjectURL(url);
        currentAudio = null;
      };
      await currentAudio.play();
    } catch (err) {
      speaking = false;
      bus.emit("agent:speaking", false);
      bus.emit("agent:tts-error", { provider: "edge-tts", error: err.message });
    }
  }

  function stop() {
    if (currentAudio) { currentAudio.pause(); currentAudio.src = ""; currentAudio = null; }
    speaking = false;
    bus.emit("agent:speaking", false);
  }

  return { name: "edge-tts", speak, stop, isSpeaking: () => speaking, dispose: stop };
}
