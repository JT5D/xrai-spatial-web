/**
 * Edge TTS provider — natural neural voices via server proxy.
 * Calls POST /agent/tts on our server, which proxies to Microsoft Edge TTS.
 * No API key needed. Falls back to web-speech if server unreachable.
 */
export function createEdgeTTSProvider(hooks) {
  if (typeof window === "undefined") return null;

  let currentAudio = null;
  let speaking = false;

  async function speak(text) {
    if (!text?.trim()) return;

    // Cancel current
    stop();
    speaking = true;
    hooks.emit("agent:speaking", true);

    try {
      const res = await fetch("/agent/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice: "en-US-GuyNeural",
        }),
      });

      if (!res.ok) throw new Error(`TTS server returned ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      currentAudio = new Audio(url);
      currentAudio.onended = () => {
        speaking = false;
        hooks.emit("agent:speaking", false);
        hooks.emit("agent:spoken");
        URL.revokeObjectURL(url);
        currentAudio = null;
      };
      currentAudio.onerror = () => {
        speaking = false;
        hooks.emit("agent:speaking", false);
        URL.revokeObjectURL(url);
        currentAudio = null;
      };

      await currentAudio.play();
    } catch (err) {
      speaking = false;
      hooks.emit("agent:speaking", false);
      hooks.emit("agent:tts-error", { provider: "edge-tts", error: err.message });
    }
  }

  function stop() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio = null;
    }
    speaking = false;
    hooks.emit("agent:speaking", false);
  }

  return {
    name: "edge-tts",
    speak,
    stop,
    isSpeaking: () => speaking,
    dispose: stop,
  };
}
