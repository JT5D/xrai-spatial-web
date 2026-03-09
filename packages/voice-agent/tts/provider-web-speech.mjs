/**
 * Web Speech API TTS provider — built-in browser synthesis.
 * Works offline. Sounds robotic. Used as last-resort fallback.
 */
export function createWebSpeechProvider(bus) {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;

  const synth = window.speechSynthesis;
  let selectedVoice = null;

  function selectVoice() {
    const voices = synth.getVoices();
    if (!voices.length) return;
    const prefs = ["samantha", "google uk english", "karen", "daniel"];
    for (const pref of prefs) {
      const match = voices.find((v) => v.name.toLowerCase().includes(pref));
      if (match) { selectedVoice = match; return; }
    }
    selectedVoice = voices.find((v) => v.lang.startsWith("en")) || voices[0];
  }

  if (synth.getVoices().length > 0) selectVoice();
  else synth.addEventListener("voiceschanged", selectVoice, { once: true });

  return {
    name: "web-speech",
    speak(text) {
      if (!text?.trim()) return;
      synth.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      if (selectedVoice) utt.voice = selectedVoice;
      utt.rate = 1.05;
      utt.pitch = 1.0;
      utt.onstart = () => bus.emit("agent:speaking", true);
      utt.onend = () => { bus.emit("agent:speaking", false); bus.emit("agent:spoken"); };
      utt.onerror = () => bus.emit("agent:speaking", false);
      synth.speak(utt);
    },
    stop() { synth.cancel(); bus.emit("agent:speaking", false); },
    isSpeaking() { return synth.speaking; },
    dispose() { synth.cancel(); },
  };
}
