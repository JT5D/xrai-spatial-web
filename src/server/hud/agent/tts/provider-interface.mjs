/**
 * TTS Provider Interface — all providers implement this contract.
 *
 * speak(text: string): void   — start speaking (interrupts current)
 * stop(): void                — cancel current speech
 * isSpeaking(): boolean       — whether audio is playing
 * dispose(): void             — cleanup
 */
export const TTS_PROVIDER = {
  EDGE: "edge-tts",
  WEB_SPEECH: "web-speech",
};

/** Default provider preference order */
export const PROVIDER_PRIORITY = [TTS_PROVIDER.EDGE, TTS_PROVIDER.WEB_SPEECH];
