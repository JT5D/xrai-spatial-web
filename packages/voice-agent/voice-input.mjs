/**
 * Voice input — Web Speech API with configurable wake word detection.
 *
 * Modes:
 *   "passive"  — always listening for wake word (default)
 *   "active"   — sends all speech to the agent
 *   "off"      — not listening at all
 *
 * Config:
 *   wakeWords: string[]           — words that activate (default: ["jarvis", "hey jarvis"])
 *   activeTimeoutMs: number       — return to passive after silence (default: 5000)
 *   lang: string                  — recognition language (default: "en-US")
 */
export function createVoiceInput(bus, config = {}) {
  const SpeechRecognition =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  if (!SpeechRecognition) {
    bus.emit("agent:speech-error", { message: "Speech recognition not supported" });
    return {
      start() {}, stop() {}, toggle() {}, startPassive() {},
      isListening: () => false, isSupported: () => false,
      getMode: () => "off", dispose() {},
    };
  }

  const WAKE_WORDS = config.wakeWords || ["jarvis", "hey jarvis", "hey, jarvis", "ok jarvis", "yo jarvis"];
  const ACTIVE_TIMEOUT_MS = config.activeTimeoutMs || 5000;
  const LANG = config.lang || "en-US";

  let recognition = null;
  let mode = "off";
  let activeTimer = null;
  let wakeWordStripped = "";

  function matchesWakeWord(text) {
    const lower = text.toLowerCase().trim();
    for (const ww of WAKE_WORDS) {
      const idx = lower.indexOf(ww);
      if (idx !== -1) return lower.slice(idx + ww.length).trim();
    }
    return null;
  }

  function createRecognition() {
    const r = new SpeechRecognition();
    r.continuous = true;
    r.interimResults = true;
    r.lang = LANG;
    r.maxAlternatives = 1;

    r.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const text = last[0].transcript;

      if (mode === "passive") {
        const afterWake = matchesWakeWord(text);
        if (afterWake !== null && last.isFinal) {
          wakeWordStripped = afterWake;
          activateFromWake(afterWake);
        }
        return;
      }

      if (mode === "active") {
        resetActiveTimer();
        if (last.isFinal) {
          const fullText = wakeWordStripped ? wakeWordStripped + " " + text : text;
          wakeWordStripped = "";
          bus.emit("agent:final", fullText.trim());
          if (/iPhone|iPad|iPod/.test(navigator.userAgent)) restartRecognition();
        } else {
          bus.emit("agent:interim", text);
        }
      }
    };

    r.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      bus.emit("agent:speech-error", { message: event.error });
    };

    r.onend = () => {
      if (mode !== "off") {
        try { r.start(); } catch {}
      }
    };

    return r;
  }

  function activateFromWake(afterText) {
    mode = "active";
    bus.emit("agent:woke", { trigger: "wake-word" });
    bus.emit("agent:listening", true);
    if (afterText) wakeWordStripped = afterText;
    resetActiveTimer();
  }

  function resetActiveTimer() {
    clearTimeout(activeTimer);
    activeTimer = setTimeout(() => {
      if (mode === "active") {
        if (wakeWordStripped) {
          bus.emit("agent:final", wakeWordStripped.trim());
          wakeWordStripped = "";
        }
        returnToPassive();
      }
    }, ACTIVE_TIMEOUT_MS);
  }

  function returnToPassive() {
    mode = "passive";
    clearTimeout(activeTimer);
    wakeWordStripped = "";
    bus.emit("agent:listening", false);
    bus.emit("agent:passive", true);
  }

  function restartRecognition() {
    if (recognition) { try { recognition.stop(); } catch {} }
    recognition = createRecognition();
    try { recognition.start(); } catch {}
  }

  function startPassive() {
    if (mode !== "off") return;
    mode = "passive";
    recognition = createRecognition();
    try { recognition.start(); } catch {}
    bus.emit("agent:passive", true);
  }

  function start() {
    if (mode === "active") return;
    mode = "active";
    if (!recognition) {
      recognition = createRecognition();
      try { recognition.start(); } catch {}
    }
    bus.emit("agent:listening", true);
    resetActiveTimer();
  }

  function stop() {
    mode = "off";
    clearTimeout(activeTimer);
    wakeWordStripped = "";
    if (recognition) { try { recognition.stop(); } catch {} recognition = null; }
    bus.emit("agent:listening", false);
    bus.emit("agent:passive", false);
  }

  function toggle() {
    if (mode === "off") startPassive();
    else if (mode === "passive") start();
    else returnToPassive();
  }

  return {
    start, startPassive, stop, toggle,
    isListening: () => mode === "active",
    isPassive: () => mode === "passive",
    isSupported: () => true,
    getMode: () => mode,
    dispose: stop,
  };
}
