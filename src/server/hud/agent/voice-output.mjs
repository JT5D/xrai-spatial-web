/**
 * Voice output — provider-based TTS with automatic fallback.
 * Default: Edge TTS (natural neural voice via server proxy).
 * Fallback: Web Speech API (robotic, works offline).
 */
import { createEdgeTTSProvider } from "./tts/provider-edge-tts.mjs";
import { createWebSpeechProvider } from "./tts/provider-web-speech.mjs";
import { TTS_PROVIDER } from "./tts/provider-interface.mjs";

export function createVoiceOutput(hooks) {
  if (typeof window === "undefined") {
    return { speak() {}, stop() {}, isSpeaking: () => false, setProvider() {}, getProvider: () => null, dispose() {} };
  }

  const providers = new Map();
  let active = null;

  // Initialize available providers
  const edge = createEdgeTTSProvider(hooks);
  if (edge) providers.set(TTS_PROVIDER.EDGE, edge);

  const webSpeech = createWebSpeechProvider(hooks);
  if (webSpeech) providers.set(TTS_PROVIDER.WEB_SPEECH, webSpeech);

  // Listen for Edge TTS failures — auto-fallback to web-speech
  hooks.on("agent:tts-error", ({ provider }) => {
    if (provider === "edge-tts" && providers.has(TTS_PROVIDER.WEB_SPEECH)) {
      console.warn("[voice-output] Edge TTS failed, falling back to Web Speech API");
      active = providers.get(TTS_PROVIDER.WEB_SPEECH);
    }
  });

  // Default to Edge TTS, fallback to Web Speech
  active = providers.get(TTS_PROVIDER.EDGE) || providers.get(TTS_PROVIDER.WEB_SPEECH) || null;

  function speak(text) {
    if (!active || !text?.trim()) return;
    active.speak(text);
  }

  function stop() {
    if (active) active.stop();
  }

  function setProvider(name) {
    const p = providers.get(name);
    if (p) {
      if (active) active.stop();
      active = p;
    }
  }

  function getProvider() {
    return active?.name || null;
  }

  function dispose() {
    for (const p of providers.values()) p.dispose();
  }

  return { speak, stop, isSpeaking: () => active?.isSpeaking() || false, setProvider, getProvider, dispose };
}
