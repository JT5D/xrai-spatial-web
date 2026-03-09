/**
 * ElevenLabs TTS proxy — premium neural voices.
 * Requires ELEVENLABS_API_KEY env var.
 * Falls back gracefully if not configured.
 */

const API_BASE = "https://api.elevenlabs.io/v1";

// Curated voices for Jarvis-like experience
export const VOICES = {
  "adam":    { id: "pNInz6obpgDQGcFmaJgB", name: "Adam",    desc: "Deep, authoritative male" },
  "josh":   { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh",    desc: "Warm, conversational male" },
  "arnold": { id: "VR6AewLTigWG4xSOukaG", name: "Arnold",  desc: "Crisp, professional male" },
  "rachel": { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel",  desc: "Clear, natural female" },
  "domi":   { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi",    desc: "Strong, confident female" },
  "bella":  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella",   desc: "Soft, warm female" },
};

const DEFAULT_VOICE = "adam";
const MODEL = "eleven_multilingual_v2";

export function isConfigured() {
  return !!process.env.ELEVENLABS_API_KEY;
}

export async function speak(text, opts = {}) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");
  if (!text?.trim()) return Buffer.alloc(0);

  const voiceKey = opts.voice || DEFAULT_VOICE;
  const voice = VOICES[voiceKey] || VOICES[DEFAULT_VOICE];

  const res = await fetch(`${API_BASE}/text-to-speech/${voice.id}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: opts.model || MODEL,
      voice_settings: {
        stability: opts.stability ?? 0.5,
        similarity_boost: opts.similarity ?? 0.75,
        style: opts.style ?? 0.0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`ElevenLabs ${res.status}: ${err.slice(0, 200)}`);
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

export function listVoices() {
  return Object.entries(VOICES).map(([key, v]) => ({
    key,
    name: v.name,
    description: v.desc,
  }));
}
