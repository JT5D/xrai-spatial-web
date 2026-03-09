/**
 * Voice input — Web Speech API continuous recognition.
 * Falls back to null if SpeechRecognition is unavailable (Firefox).
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
      start() {},
      stop() {},
      toggle() {},
      isListening: () => false,
      isSupported: () => false,
      dispose() {},
    };
  }

  let recognition = null;
  let listening = false;

  function createRecognition() {
    const r = new SpeechRecognition();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    r.maxAlternatives = 1;

    r.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const text = last[0].transcript;

      if (last.isFinal) {
        hooks.emit("agent:final", text);
        // iOS Safari kills continuous mode — restart
        if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
          restartRecognition();
        }
      } else {
        hooks.emit("agent:interim", text);
      }
    };

    r.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      hooks.emit("agent:speech-error", { message: event.error });
    };

    r.onend = () => {
      // Auto-restart if still supposed to be listening
      if (listening) {
        try {
          r.start();
        } catch {
          // Ignore — may already be started
        }
      }
    };

    return r;
  }

  function restartRecognition() {
    if (recognition) {
      try {
        recognition.stop();
      } catch {}
    }
    recognition = createRecognition();
    try {
      recognition.start();
    } catch {}
  }

  function start() {
    if (listening) return;
    listening = true;
    recognition = createRecognition();
    try {
      recognition.start();
    } catch {}
    hooks.emit("agent:listening", true);
  }

  function stop() {
    if (!listening) return;
    listening = false;
    if (recognition) {
      try {
        recognition.stop();
      } catch {}
      recognition = null;
    }
    hooks.emit("agent:listening", false);
  }

  function toggle() {
    listening ? stop() : start();
  }

  function dispose() {
    stop();
  }

  return {
    start,
    stop,
    toggle,
    isListening: () => listening,
    isSupported: () => true,
    dispose,
  };
}
