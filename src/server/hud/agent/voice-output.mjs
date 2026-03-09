/**
 * Voice output — provider-based TTS with automatic fallback.
 * Priority: ElevenLabs (premium) → Edge TTS (free neural) → Web Speech API (offline).
 */
import { createElevenLabsProvider } from "./tts/provider-elevenlabs.mjs";
import { createEdgeTTSProvider } from "./tts/provider-edge-tts.mjs";
import { createWebSpeechProvider } from "./tts/provider-web-speech.mjs";
import { TTS_PROVIDER } from "./tts/provider-interface.mjs";

export function createVoiceOutput(hooks) {
  if (typeof window === "undefined") {
    return { speak() {}, stop() {}, isSpeaking: () => false, setProvider() {}, getProvider: () => null, listProviders: () => [], dispose() {} };
  }

  const providers = new Map();
  let active = null;

  // Initialize all available providers
  const elevenlabs = createElevenLabsProvider(hooks);
  if (elevenlabs) providers.set(TTS_PROVIDER.ELEVENLABS, elevenlabs);

  const edge = createEdgeTTSProvider(hooks);
  if (edge) providers.set(TTS_PROVIDER.EDGE, edge);

  const webSpeech = createWebSpeechProvider(hooks);
  if (webSpeech) providers.set(TTS_PROVIDER.WEB_SPEECH, webSpeech);

  // Auto-fallback chain on TTS errors
  hooks.on("agent:tts-error", ({ provider }) => {
    if (provider === "elevenlabs" && providers.has(TTS_PROVIDER.EDGE)) {
      console.warn("[voice-output] ElevenLabs failed, falling back to Edge TTS");
      active = providers.get(TTS_PROVIDER.EDGE);
    } else if (provider === "edge-tts" && providers.has(TTS_PROVIDER.WEB_SPEECH)) {
      console.warn("[voice-output] Edge TTS failed, falling back to Web Speech API");
      active = providers.get(TTS_PROVIDER.WEB_SPEECH);
    }
  });

  // Pick best available: ElevenLabs > Edge > Web Speech
  active = providers.get(TTS_PROVIDER.ELEVENLABS)
    || providers.get(TTS_PROVIDER.EDGE)
    || providers.get(TTS_PROVIDER.WEB_SPEECH)
    || null;

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

  function listProviders() {
    return Array.from(providers.keys());
  }

  function dispose() {
    for (const p of providers.values()) p.dispose();
  }

  return { speak, stop, isSpeaking: () => active?.isSpeaking() || false, setProvider, getProvider, listProviders, dispose };
}
