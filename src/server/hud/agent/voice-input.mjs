/**
 * Voice input — Web Speech API with wake word detection.
 *
 * Modes:
 *   "passive"  — always listening for "Jarvis" or "Hey Jarvis" (default)
 *   "active"   — sends all speech to the agent (toggle with mic button)
 *   "off"      — not listening at all
 *
 * Wake word flow:
 *   1. Passive mode: recognition runs continuously, scanning for wake word
 *   2. Wake word detected → switch to active, emit agent:woke
 *   3. Capture the command (text after wake word + next utterances)
 *   4. After silence timeout → emit agent:final, return to passive
 */
export function createVoiceInput(hooks) {
  const SpeechRecognition =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  if (!SpeechRecognition) {
    hooks.emit("agent:speech-error", {
      message: "Speech recognition not supported in this browser",
    });
    return {
      start() {}, stop() {}, toggle() {}, startPassive() {},
      isListening: () => false, isSupported: () => false,
      getMode: () => "off", dispose() {},
    };
  }

  const WAKE_WORDS = ["jarvis", "hey jarvis", "hey, jarvis", "ok jarvis", "yo jarvis"];
  const ACTIVE_TIMEOUT_MS = 5000; // return to passive after 5s silence

  let recognition = null;
  let mode = "off"; // "off" | "passive" | "active"
  let activeTimer = null;
  let wakeWordStripped = ""; // text after wake word in the same utterance

  function matchesWakeWord(text) {
    const lower = text.toLowerCase().trim();
    for (const ww of WAKE_WORDS) {
      const idx = lower.indexOf(ww);
      if (idx !== -1) {
        // Return the text after the wake word
        return lower.slice(idx + ww.length).trim();
      }
    }
    return null;
  }

  function createRecognition() {
    const r = new SpeechRecognition();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    r.maxAlternatives = 1;

    r.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const text = last[0].transcript;

      if (mode === "passive") {
        // Scan for wake word
        const afterWake = matchesWakeWord(text);
        if (afterWake !== null && last.isFinal) {
          // Wake word detected — activate
          wakeWordStripped = afterWake;
          activateFromWake(afterWake);
        }
        // In passive mode, don't emit interim/final events
        return;
      }

      if (mode === "active") {
        // Reset silence timer on any speech
        resetActiveTimer();

        if (last.isFinal) {
          const fullText = wakeWordStripped
            ? wakeWordStripped + " " + text
            : text;
          wakeWordStripped = "";
          hooks.emit("agent:final", fullText.trim());

          // iOS Safari kills continuous mode
          if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
            restartRecognition();
          }
        } else {
          hooks.emit("agent:interim", text);
        }
      }
    };

    r.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      hooks.emit("agent:speech-error", { message: event.error });
    };

    r.onend = () => {
      // Auto-restart if in passive or active mode
      if (mode !== "off") {
        try { r.start(); } catch { /* already started */ }
      }
    };

    return r;
  }

  function activateFromWake(afterText) {
    mode = "active";
    hooks.emit("agent:woke", { trigger: "wake-word" });
    hooks.emit("agent:listening", true);

    // If there was text after the wake word, it'll be prepended to next final
    if (afterText) {
      wakeWordStripped = afterText;
    }

    // Start silence timer — return to passive if no speech
    resetActiveTimer();
  }

  function resetActiveTimer() {
    clearTimeout(activeTimer);
    activeTimer = setTimeout(() => {
      if (mode === "active") {
        // If we had accumulated text, send it
        if (wakeWordStripped) {
          hooks.emit("agent:final", wakeWordStripped.trim());
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
    hooks.emit("agent:listening", false);
    hooks.emit("agent:passive", true);
    // Recognition keeps running — just changes how we handle results
  }

  function restartRecognition() {
    if (recognition) {
      try { recognition.stop(); } catch {}
    }
    recognition = createRecognition();
    try { recognition.start(); } catch {}
  }

  /** Start in always-on passive (wake word) mode */
  function startPassive() {
    if (mode !== "off") return;
    mode = "passive";
    recognition = createRecognition();
    try { recognition.start(); } catch {}
    hooks.emit("agent:passive", true);
  }

  /** Start in active (always-send) mode — like clicking the mic */
  function start() {
    if (mode === "active") return;
    mode = "active";
    if (!recognition) {
      recognition = createRecognition();
      try { recognition.start(); } catch {}
    }
    hooks.emit("agent:listening", true);
    resetActiveTimer();
  }

  /** Stop all listening */
  function stop() {
    mode = "off";
    clearTimeout(activeTimer);
    wakeWordStripped = "";
    if (recognition) {
      try { recognition.stop(); } catch {}
      recognition = null;
    }
    hooks.emit("agent:listening", false);
    hooks.emit("agent:passive", false);
  }

  /** Toggle: off → passive, passive → active, active → passive */
  function toggle() {
    if (mode === "off") startPassive();
    else if (mode === "passive") start();
    else returnToPassive();
  }

  function dispose() {
    stop();
  }

  return {
    start,
    startPassive,
    stop,
    toggle,
    isListening: () => mode === "active",
    isPassive: () => mode === "passive",
    isSupported: () => true,
    getMode: () => mode,
    dispose,
  };
}
