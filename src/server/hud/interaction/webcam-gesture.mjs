/**
 * Webcam gesture navigation — optional hand tracking via MediaPipe/getUserMedia.
 * Provides simple wave/point gestures for navigating the 3D graph.
 * Uses MediaDevices API + basic motion detection (no ML dependency for v1).
 */
export function createWebcamGesture(hooks) {
  let stream = null;
  let video = null;
  let canvas = null;
  let ctx = null;
  let animFrame = null;
  let prevFrame = null;
  let active = false;

  // Motion regions (left/right/up/down quadrants of webcam)
  const REGIONS = {
    left: { x: 0, y: 0.2, w: 0.3, h: 0.6 },
    right: { x: 0.7, y: 0.2, w: 0.3, h: 0.6 },
    up: { x: 0.2, y: 0, w: 0.6, h: 0.3 },
    down: { x: 0.2, y: 0.7, w: 0.6, h: 0.3 },
    center: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 },
  };

  const MOTION_THRESHOLD = 25; // pixel diff threshold
  const GESTURE_COOLDOWN = 600; // ms between gestures
  let lastGestureTime = 0;

  async function start() {
    if (active) return;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 160, height: 120, facingMode: "user" },
      });
    } catch (err) {
      hooks.emit("webcam:error", { message: err.message });
      return;
    }

    video = document.createElement("video");
    video.srcObject = stream;
    video.setAttribute("playsinline", "");
    video.muted = true;
    await video.play();

    canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 120;
    ctx = canvas.getContext("2d", { willReadFrequently: true });

    active = true;
    hooks.emit("webcam:active", true);
    detectLoop();
  }

  function stop() {
    active = false;
    if (animFrame) cancelAnimationFrame(animFrame);
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    video = null;
    canvas = null;
    ctx = null;
    prevFrame = null;
    hooks.emit("webcam:active", false);
  }

  function toggle() {
    active ? stop() : start();
  }

  function detectLoop() {
    if (!active) return;
    animFrame = requestAnimationFrame(detectLoop);

    ctx.drawImage(video, 0, 0, 160, 120);
    const currentFrame = ctx.getImageData(0, 0, 160, 120);

    if (prevFrame) {
      const motionMap = computeMotion(prevFrame, currentFrame);
      detectGesture(motionMap);
    }

    prevFrame = currentFrame;
  }

  function computeMotion(prev, curr) {
    const regionMotion = {};
    for (const [name, r] of Object.entries(REGIONS)) {
      const x0 = Math.floor(r.x * 160);
      const y0 = Math.floor(r.y * 120);
      const x1 = Math.floor((r.x + r.w) * 160);
      const y1 = Math.floor((r.y + r.h) * 120);

      let totalDiff = 0;
      let pixelCount = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * 160 + x) * 4;
          const diff =
            Math.abs(curr.data[i] - prev.data[i]) +
            Math.abs(curr.data[i + 1] - prev.data[i + 1]) +
            Math.abs(curr.data[i + 2] - prev.data[i + 2]);
          totalDiff += diff;
          pixelCount++;
        }
      }

      regionMotion[name] = pixelCount > 0 ? totalDiff / pixelCount : 0;
    }
    return regionMotion;
  }

  function detectGesture(motionMap) {
    const now = performance.now();
    if (now - lastGestureTime < GESTURE_COOLDOWN) return;

    // Find region with most motion
    let maxRegion = null;
    let maxMotion = MOTION_THRESHOLD;

    for (const [region, motion] of Object.entries(motionMap)) {
      if (motion > maxMotion) {
        maxMotion = motion;
        maxRegion = region;
      }
    }

    if (!maxRegion) return;
    lastGestureTime = now;

    // Map regions to navigation actions
    const actions = {
      left: "navigate-left",
      right: "navigate-right",
      up: "zoom-in",
      down: "zoom-out",
      center: "select",
    };

    hooks.emit("webcam:gesture", {
      region: maxRegion,
      action: actions[maxRegion],
      intensity: maxMotion,
    });
  }

  function isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function dispose() {
    stop();
  }

  return { start, stop, toggle, isSupported, isActive: () => active, dispose };
}
