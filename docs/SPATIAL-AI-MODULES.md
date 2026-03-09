# Hot-Swappable Spatial AI Modules

> Architecture for benchmarking and switching between MediaPipe, Gemini Edge AI, YOLO,
> and ARKit for hand tracking, body tracking, object classification, and scene understanding.

## Design Principle

Every spatial AI capability is behind a **provider interface**. The app configures which
provider to use per-capability, and can switch at runtime for A/B testing and benchmarking.

```
┌──────────────────────────────────────────┐
│           Spatial Intelligence            │
│                                           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  │  Hand    │  │  Body   │  │  Object │  │
│  │ Tracking │  │ Tracking│  │ Classify│  │
│  └────┬────┘  └────┬────┘  └────┬────┘  │
│       │             │            │        │
│  ┌────▼─────────────▼────────────▼────┐  │
│  │        Provider Interface           │  │
│  │  { init, detect, dispose, meta }    │  │
│  └────┬─────────┬──────────┬──────────┘  │
│       │         │          │              │
│  ┌────▼───┐ ┌──▼────┐ ┌──▼──────┐       │
│  │MediaPipe│ │Gemini │ │  YOLO   │       │
│  │(default)│ │Edge AI│ │(TFLite) │       │
│  └────────┘ └───────┘ └─────────┘       │
└──────────────────────────────────────────┘
```

## Provider Interface

Every spatial AI provider implements this interface:

```javascript
export function createProvider(config) {
  return {
    // Lifecycle
    async init(options) {},   // Load model, warm up
    dispose() {},              // Release resources

    // Core operation
    async detect(input) {},    // input: ImageData/VideoFrame → results

    // Metadata
    meta: {
      name: "mediapipe-hands",
      capability: "hand-tracking",    // hand-tracking | body-tracking | object-classification | scene-understanding
      runtime: "gpu",                 // gpu | cpu | neural-engine | wasm
      modelSize: "2.4MB",
      targetFps: 30,
      platforms: ["web", "react-native", "ios", "android"],
    },

    // Benchmarking
    getStats() {
      return { avgMs, fps, droppedFrames, gpuMemMB };
    },
  };
}
```

## Provider Comparison Matrix

### Hand Tracking

| Provider | FPS (iPhone 15 Pro) | FPS (iPad Pro M2) | FPS (Web/Desktop) | Model Size | GPU Cost |
|----------|--------------------|--------------------|--------------------|-----------:|----------|
| **MediaPipe Hands** | 30 | 30 | 30 | 2.4MB | ~3ms |
| Gemini Nano (edge) | ~10 | ~15 | N/A | 3.7GB | N/A (LLM) |
| YOLO-Hand (TFLite) | 25 | 30 | 28 | 8MB | ~5ms |
| ARKit Hand (native) | 30 | 30 | N/A | built-in | ~1ms |

**Winner**: MediaPipe for cross-platform, ARKit for iOS-only depth accuracy.

### Body Tracking

| Provider | FPS | Joints | 3D | Platforms |
|----------|-----|--------|----|-----------|
| **MediaPipe Pose** | 30 | 33 | Yes | web, RN, native |
| MediaPipe Holistic | 25 | 33+21+21 | Yes | web, RN |
| ARKit Body | 30 | 91 | Yes | iOS only |
| YOLO-Pose | 28 | 17 | No | web, native |

**Winner**: MediaPipe Pose (cross-platform), ARKit Body (iOS with depth).

### Object Classification

| Provider | FPS | Classes | Platforms |
|----------|-----|---------|-----------|
| **MediaPipe Object** | 25 | 80 (COCO) | web, RN, native |
| YOLO v8 (TFLite) | 22 | 80 | web, native |
| Gemini Nano | ~5 | open-ended | Android 14+ |
| ARKit Scene | 30 | ~100 | iOS only |

**Winner**: MediaPipe for speed, Gemini Nano for open-ended classification (but too slow for real-time).

## Layered Performance Budget (30fps = 33ms)

When running ALL systems simultaneously on a single device:

| Layer | GPU Budget | Notes |
|-------|-----------|-------|
| ARKit depth/surfaces | 2-3ms | Neural Engine, minimal GPU |
| MediaPipe hands (2) | 3-5ms | GPU Metal delegate |
| MediaPipe pose | 4-6ms | GPU Metal delegate |
| YOLO object detection | 5-8ms | Every 3rd frame to save budget |
| Three.js/Unity rendering | 8-12ms | Scene complexity dependent |
| **Total** | **22-34ms** | At 30fps limit on iPhone 15 Pro |

### Thermal Throttling

| Device | Sustained GPU | Time to Throttle | Notes |
|--------|--------------|-------------------|-------|
| iPhone 15 Pro | ~50% | 10 min | A17 Pro heats quickly |
| **iPad Pro M2** | **85-90%** | 30+ min | **Recommended dev target** |
| MacBook Pro M2 | 95%+ | rare | Desktop thermal headroom |
| Quest 3 | 70% | 15 min | XR2 Gen 2 |

## Hot-Swap Configuration

```javascript
// spatial-config.mjs
export const SPATIAL_CONFIG = {
  handTracking: {
    provider: "mediapipe",     // "mediapipe" | "arkit" | "yolo" | "gemini-nano"
    model: "hand_landmarker",
    maxHands: 2,
    minDetectionConfidence: 0.7,
    runEveryNFrames: 1,        // 1 = every frame, 3 = every 3rd frame
  },
  bodyTracking: {
    provider: "mediapipe",
    model: "pose_landmarker",
    mode: "full",              // "lite" | "full" | "heavy"
    runEveryNFrames: 1,
  },
  objectClassification: {
    provider: "mediapipe",
    model: "object_detector",
    maxResults: 5,
    scoreThreshold: 0.5,
    runEveryNFrames: 3,        // Run less frequently to save GPU
  },
  sceneUnderstanding: {
    provider: "arkit",         // iOS only, falls back to "none" on other platforms
    meshEnabled: true,
    planeDetection: true,
  },
  voiceAgent: {
    provider: "groq",          // "groq" | "gemini" | "ollama" | "claude"
    sttModel: "whisper-large-v3",
    ttsProvider: "edge-tts",   // "edge-tts" | "elevenlabs"
  },
};
```

## Benchmarking Strategy

To benchmark provider A vs provider B:

1. **Set config**: Switch one provider while keeping others constant
2. **Run test scenario**: 60s of continuous operation with representative workload
3. **Collect metrics**: FPS, latency (ms), GPU memory, CPU %, thermal state
4. **Log to shared memory**: `write_memory("benchmark-<provider>-<capability>", results)`
5. **Compare**: Read both benchmark results, output table

```javascript
// Benchmarking hook — call from any provider
function recordBenchmark(capability, provider, results) {
  const key = `benchmark-${capability}-${provider}`;
  writeMemory(key, {
    ...results,
    ts: Date.now(),
    device: navigator.userAgent,
    thermal: navigator.deviceMemory, // approximate
  });
}
```

## Platform-Specific Adaptations

### Web (Spatial Viewer)
- MediaPipe WASM + GPU delegate via `@mediapipe/tasks-vision`
- WebGPU for Three.js rendering (WebGL2 fallback)
- No ARKit — scene understanding via MediaPipe Objectron or none

### React Native (Portals V4)
- `react-native-mediapipe` for camera + ML pipeline
- Native MediaPipe (not WASM) — better performance
- ARKit via `VisionKit` on iOS, ARCore on Android
- Unity rendering via `@artmajeur/react-native-unity`

### Native iOS (Future)
- Direct ARKit + RealityKit for spatial anchoring
- MediaPipe via Swift bindings for body/hand
- Best performance but iOS-only

### Architecture Rule: Data Flow Layers
```
Native layer (30Hz): Camera, ARKit depth, MediaPipe tracking
  → NativeArray (zero-copy)
Unity layer: 3D rendering, hologram display
  → EventBus (1-2Hz)
React Native layer: AI agent, UI, settings
  → WebSocket (async)
XRAI server: Jarvis LLM, tool execution
```

**CRITICAL**: Never route 30Hz tracking data through the RN-Unity bridge.
Use native plugins with NativeArray for per-frame data.
RN handles 1-2Hz events only (commands, state changes, AI responses).
