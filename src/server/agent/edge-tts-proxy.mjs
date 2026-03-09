/**
 * Edge TTS proxy — server-side synthesis using Microsoft Edge's free neural TTS.
 * No API key, no signup. Uses edge-tts-universal which handles all DRM auth.
 * Returns raw MP3 audio bytes.
 */

import { EdgeTTS } from "edge-tts-universal";

const VOICES = {
  "en-US-GuyNeural": "Male",
  "en-US-AriaNeural": "Female",
  "en-US-EmmaMultilingualNeural": "Female",
  "en-GB-RyanNeural": "Male",
  "en-GB-SoniaNeural": "Female",
  "en-AU-WilliamNeural": "Male",
};

const DEFAULT_VOICE = "en-US-GuyNeural";

/**
 * Synthesize text to MP3 audio buffer using Edge TTS.
 * @param {string} text - Text to speak
 * @param {object} opts - { voice, rate, pitch, volume }
 * @returns {Promise<Buffer>} MP3 audio buffer
 */
export async function speak(text, opts = {}) {
  if (!text?.trim()) return Buffer.alloc(0);

  const tts = new EdgeTTS();
  tts.text = text;
  tts.voice = opts.voice && VOICES[opts.voice] ? opts.voice : DEFAULT_VOICE;
  if (opts.rate) tts.rate = opts.rate;
  if (opts.pitch) tts.pitch = opts.pitch;
  if (opts.volume) tts.volume = opts.volume;

  const result = await tts.synthesize();
  const arrayBuf = await result.audio.arrayBuffer();
  return Buffer.from(arrayBuf);
}

export function listVoices() {
  return Object.entries(VOICES).map(([name, gender]) => ({ name, gender }));
}
