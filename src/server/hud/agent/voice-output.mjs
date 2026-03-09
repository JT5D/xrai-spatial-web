/**
 * Voice output — SpeechSynthesis TTS with voice selection and interruption.
 */
export function createVoiceOutput(hooks) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return {
      speak() {},
      stop() {},
      isSpeaking: () => false,
      dispose() {},
    };
  }

  const synth = window.speechSynthesis;
  let selectedVoice = null;

  // Select a preferred voice once voices load
  function selectVoice() {
    const voices = synth.getVoices();
    if (voices.length === 0) return;

    // Preference order: Samantha (macOS), Google UK English, any English
    const prefs = ["samantha", "google uk english", "karen", "daniel"];
    for (const pref of prefs) {
      const match = voices.find((v) =>
        v.name.toLowerCase().includes(pref)
      );
      if (match) {
        selectedVoice = match;
        return;
      }
    }
    // Fallback: first English voice
    selectedVoice =
      voices.find((v) => v.lang.startsWith("en")) || voices[0];
  }

  // Voices may load async
  if (synth.getVoices().length > 0) {
    selectVoice();
  } else {
    synth.addEventListener("voiceschanged", selectVoice, { once: true });
  }

  function speak(text) {
    if (!text?.trim()) return;

    // Cancel current speech (interruption)
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    utterance.onstart = () => hooks.emit("agent:speaking", true);
    utterance.onend = () => {
      hooks.emit("agent:speaking", false);
      hooks.emit("agent:spoken");
    };
    utterance.onerror = () => hooks.emit("agent:speaking", false);

    synth.speak(utterance);
  }

  function stop() {
    synth.cancel();
    hooks.emit("agent:speaking", false);
  }

  function dispose() {
    stop();
  }

  return {
    speak,
    stop,
    isSpeaking: () => synth.speaking,
    dispose,
  };
}
