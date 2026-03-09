/**
 * Voice output — provider-based TTS with automatic fallback.
 * Priority: ElevenLabs (premium) → Edge TTS (free neural) → Web Speech API (offline).
 *
 * Config:
 *   baseUrl: string      — server URL for TTS proxies (default: "")
 *   providers: string[]   — override provider priority (default: all)
 */
import { createElevenLabsProvider } from "./tts/provider-elevenlabs.mjs";
import { createEdgeTTSProvider } from "./tts/provider-edge-tts.mjs";
import { createWebSpeechProvider } from "./tts/provider-web-speech.mjs";
import { TTS_PROVIDER } from "./tts/provider-interface.mjs";

export function createVoiceOutput(bus, config = {}) {
  if (typeof window === "undefined") {
    return { speak() {}, stop() {}, isSpeaking: () => false, setProvider() {}, getProvider: () => null, listProviders: () => [], dispose() {} };
  }

  const providerOpts = { baseUrl: config.baseUrl || "" };
  const providers = new Map();
  let active = null;

  const elevenlabs = createElevenLabsProvider(bus, providerOpts);
  if (elevenlabs) providers.set(TTS_PROVIDER.ELEVENLABS, elevenlabs);

  const edge = createEdgeTTSProvider(bus, providerOpts);
  if (edge) providers.set(TTS_PROVIDER.EDGE, edge);

  const webSpeech = createWebSpeechProvider(bus);
  if (webSpeech) providers.set(TTS_PROVIDER.WEB_SPEECH, webSpeech);

  // Auto-fallback chain
  bus.on("agent:tts-error", ({ provider }) => {
    if (provider === "elevenlabs" && providers.has(TTS_PROVIDER.EDGE)) {
      active = providers.get(TTS_PROVIDER.EDGE);
    } else if (provider === "edge-tts" && providers.has(TTS_PROVIDER.WEB_SPEECH)) {
      active = providers.get(TTS_PROVIDER.WEB_SPEECH);
    }
  });

  // Pick best available
  active = providers.get(TTS_PROVIDER.ELEVENLABS)
    || providers.get(TTS_PROVIDER.EDGE)
    || providers.get(TTS_PROVIDER.WEB_SPEECH)
    || null;

  function speak(text) {
    if (!active || !text?.trim()) return;
    active.speak(text);
  }

  function stop() { if (active) active.stop(); }

  function setProvider(name) {
    const p = providers.get(name);
    if (p) { if (active) active.stop(); active = p; }
  }

  function getProvider() { return active?.name || null; }
  function listProviders() { return Array.from(providers.keys()); }
  function dispose() { for (const p of providers.values()) p.dispose(); }

  return { speak, stop, isSpeaking: () => active?.isSpeaking() || false, setProvider, getProvider, listProviders, dispose };
}
