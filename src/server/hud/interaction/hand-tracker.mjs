/**
 * MediaPipe Hand Tracker — real hand tracking with 21-joint skeleton.
 * Uses @mediapipe/tasks-vision (loaded from CDN) for palm/finger detection.
 *
 * Gestures detected:
 *   - pinch: thumb-index close (<40px) → select/grab node
 *   - point: index extended, others curled → aim/highlight
 *   - grab:  all fingers curled → grab and move
 *   - open:  all fingers extended → release/idle
 *   - swipe: fast lateral palm movement → navigate
 *
 * Hooks emitted:
 *   hand:tracking  { hands: [{ landmarks, handedness, gestures }] }
 *   hand:gesture   { gesture, hand, confidence, landmarks }
 *   hand:pinch     { x, y, z, hand }       — normalized pinch midpoint
 *   hand:point     { x, y, z, direction }   — index tip + aim direction
 *   hand:grab      { x, y, z, hand }        — palm center
 *   hand:lost      {}                        — no hands detected
 *   webcam:active  boolean                   — backward compat
 *   webcam:gesture { region, action, intensity } — backward compat bridge
 */
const CDN_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";

// Landmark indices (MediaPipe hand model)
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const INDEX_MCP = 5;
const MIDDLE_TIP = 12;
const MIDDLE_MCP = 9;
const RING_TIP = 16;
const RING_MCP = 13;
const PINKY_TIP = 20;
const PINKY_MCP = 17;

export function createHandTracker(hooks, options = {}) {
  const {
    maxHands = 2,
    minDetectionConfidence = 0.5,
    minTrackingConfidence = 0.5,
    pinchThreshold = 0.06,     // normalized distance threshold
    curlThreshold = 0.08,      // finger curl detection
    swipeThreshold = 0.15,     // normalized velocity for swipe
    gestureCooldownMs = 300,
  } = options;

  let handLandmarker = null;
  let video = null;
  let stream = null;
  let animFrame = null;
  let active = false;
  let lastGestureTime = 0;
  let prevPalmPos = null;
  let prevTimestamp = 0;
  let loadingVision = false;

  // ─── Lazy-load MediaPipe Vision module ───

  async function loadVision() {
    if (loadingVision) return null;
    loadingVision = true;

    try {
      // Import from CDN
      const { HandLandmarker, FilesetResolver } = await import(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18"
      );

      const vision = await FilesetResolver.forVisionTasks(CDN_BASE);

      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: maxHands,
        minHandDetectionConfidence: minDetectionConfidence,
        minHandPresenceConfidence: minTrackingConfidence,
      });

      return handLandmarker;
    } catch (err) {
      hooks.emit("hand:error", { message: `Failed to load MediaPipe: ${err.message}` });
      loadingVision = false;
      return null;
    }
  }

  // ─── Start tracking ───

  async function start() {
    if (active) return;

    // Load MediaPipe model
    if (!handLandmarker) {
      hooks.emit("hand:loading", true);
      await loadVision();
      hooks.emit("hand:loading", false);
      if (!handLandmarker) return;
    }

    // Get webcam
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
    } catch (err) {
      hooks.emit("hand:error", { message: `Webcam error: ${err.message}` });
      hooks.emit("webcam:error", { message: err.message });
      return;
    }

    video = document.createElement("video");
    video.srcObject = stream;
    video.setAttribute("playsinline", "");
    video.muted = true;
    await video.play();

    active = true;
    hooks.emit("webcam:active", true);
    hooks.emit("hand:active", true);
    detectLoop();
  }

  // ─── Stop tracking ───

  function stop() {
    active = false;
    if (animFrame) cancelAnimationFrame(animFrame);
    animFrame = null;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    video = null;
    prevPalmPos = null;
    hooks.emit("webcam:active", false);
    hooks.emit("hand:active", false);
  }

  function toggle() {
    active ? stop() : start();
  }

  // ─── Detection loop ───

  function detectLoop() {
    if (!active || !video || !handLandmarker) return;
    animFrame = requestAnimationFrame(detectLoop);

    const now = performance.now();
    if (video.readyState < 2) return; // not ready

    let results;
    try {
      results = handLandmarker.detectForVideo(video, now);
    } catch {
      return; // skip frame on error
    }

    if (!results.landmarks || results.landmarks.length === 0) {
      if (prevPalmPos) {
        hooks.emit("hand:lost", {});
        prevPalmPos = null;
      }
      return;
    }

    // Process each detected hand
    const hands = results.landmarks.map((landmarks, i) => {
      const handedness = results.handednesses?.[i]?.[0]?.categoryName || "Unknown";
      const gestures = detectGestures(landmarks, handedness, now);
      return { landmarks, handedness, gestures };
    });

    hooks.emit("hand:tracking", { hands });
  }

  // ─── Gesture detection ───

  function dist3d(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
  }

  function isFingerCurled(tip, mcp, wrist) {
    // Finger is curled if tip is closer to wrist than MCP is
    return dist3d(tip, wrist) < dist3d(mcp, wrist) + curlThreshold;
  }

  function detectGestures(landmarks, handedness, now) {
    const gestures = [];
    const wrist = landmarks[WRIST];
    const thumbTip = landmarks[THUMB_TIP];
    const indexTip = landmarks[INDEX_TIP];
    const indexMcp = landmarks[INDEX_MCP];
    const middleTip = landmarks[MIDDLE_TIP];
    const middleMcp = landmarks[MIDDLE_MCP];
    const ringTip = landmarks[RING_TIP];
    const ringMcp = landmarks[RING_MCP];
    const pinkyTip = landmarks[PINKY_TIP];
    const pinkyMcp = landmarks[PINKY_MCP];

    // Finger curl states
    const indexCurled = isFingerCurled(indexTip, indexMcp, wrist);
    const middleCurled = isFingerCurled(middleTip, middleMcp, wrist);
    const ringCurled = isFingerCurled(ringTip, ringMcp, wrist);
    const pinkyCurled = isFingerCurled(pinkyTip, pinkyMcp, wrist);

    // Pinch: thumb-index distance
    const pinchDist = dist3d(thumbTip, indexTip);
    if (pinchDist < pinchThreshold) {
      const midpoint = {
        x: (thumbTip.x + indexTip.x) / 2,
        y: (thumbTip.y + indexTip.y) / 2,
        z: (thumbTip.z + indexTip.z) / 2,
      };
      gestures.push({ name: "pinch", confidence: 1 - pinchDist / pinchThreshold });
      emitGesture("pinch", handedness, midpoint, now);
      hooks.emit("hand:pinch", { ...midpoint, hand: handedness });
    }

    // Point: index extended, others curled
    if (!indexCurled && middleCurled && ringCurled && pinkyCurled) {
      const direction = {
        x: indexTip.x - indexMcp.x,
        y: indexTip.y - indexMcp.y,
        z: indexTip.z - indexMcp.z,
      };
      gestures.push({ name: "point", confidence: 0.9 });
      emitGesture("point", handedness, indexTip, now);
      hooks.emit("hand:point", { ...indexTip, direction, hand: handedness });
    }

    // Grab: all fingers curled
    if (indexCurled && middleCurled && ringCurled && pinkyCurled) {
      const palmCenter = {
        x: (wrist.x + middleMcp.x) / 2,
        y: (wrist.y + middleMcp.y) / 2,
        z: (wrist.z + middleMcp.z) / 2,
      };
      gestures.push({ name: "grab", confidence: 0.85 });
      emitGesture("grab", handedness, palmCenter, now);
      hooks.emit("hand:grab", { ...palmCenter, hand: handedness });
    }

    // Open: all fingers extended
    if (!indexCurled && !middleCurled && !ringCurled && !pinkyCurled) {
      gestures.push({ name: "open", confidence: 0.8 });
    }

    // Swipe detection (palm velocity)
    const palmPos = { x: wrist.x, y: wrist.y, z: wrist.z };
    if (prevPalmPos && prevTimestamp) {
      const dt = (now - prevTimestamp) / 1000;
      if (dt > 0 && dt < 0.2) {
        const vx = (palmPos.x - prevPalmPos.x) / dt;
        const vy = (palmPos.y - prevPalmPos.y) / dt;
        if (Math.abs(vx) > swipeThreshold) {
          const dir = vx > 0 ? "left" : "right"; // mirrored webcam
          gestures.push({ name: `swipe-${dir}`, confidence: 0.7 });
          emitBackwardCompat(dir === "left" ? "navigate-left" : "navigate-right", Math.abs(vx));
        }
        if (Math.abs(vy) > swipeThreshold) {
          const dir = vy > 0 ? "down" : "up"; // y inverted
          gestures.push({ name: `swipe-${dir}`, confidence: 0.7 });
          emitBackwardCompat(dir === "up" ? "zoom-in" : "zoom-out", Math.abs(vy));
        }
      }
    }
    prevPalmPos = palmPos;
    prevTimestamp = now;

    return gestures;
  }

  function emitGesture(gesture, hand, position, now) {
    if (now - lastGestureTime < gestureCooldownMs) return;
    lastGestureTime = now;
    hooks.emit("hand:gesture", { gesture, hand, position });
  }

  // Backward compat with webcam:gesture events
  function emitBackwardCompat(action, intensity) {
    const now = performance.now();
    if (now - lastGestureTime < gestureCooldownMs) return;
    lastGestureTime = now;
    hooks.emit("webcam:gesture", { region: "hand", action, intensity });
  }

  // ─── API ───

  function isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function dispose() {
    stop();
    if (handLandmarker) {
      handLandmarker.close();
      handLandmarker = null;
    }
  }

  return {
    start,
    stop,
    toggle,
    isSupported,
    isActive: () => active,
    dispose,
  };
}
