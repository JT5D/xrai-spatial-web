/**
 * TTS Provider Interface — all providers implement this contract.
 *
 * speak(text: string): void   — start speaking (interrupts current)
 * stop(): void                — cancel current speech
 * isSpeaking(): boolean       — whether audio is playing
 * dispose(): void             — cleanup
 */
export const TTS_PROVIDER = {
  ELEVENLABS: "elevenlabs",
  EDGE: "edge-tts",
  WEB_SPEECH: "web-speech",
};

export const PROVIDER_PRIORITY = [TTS_PROVIDER.ELEVENLABS, TTS_PROVIDER.EDGE, TTS_PROVIDER.WEB_SPEECH];
