# Portals Spatial Intelligence — Spec Kit

> Constitution for spatial awareness, gesture control, and voice-driven mixed reality in the Portals app.

**Version**: 1.0.0
**Date**: 2026-03-09
**Status**: Draft — Review & Approve

---

## 1. Vision

Jarvis is an always-on spatial intelligence agent that:
- **Sees** your surroundings (object classification, scene understanding)
- **Tracks** your body (full body tracking, hand pose, gesture control)
- **Listens** to voice commands and converts them to Unity scene actions
- **Remembers** context, preferences, and conversation history (long-term memory)
- **Synthesizes** all inputs into a JSON command stream for the Unity bridge

All capabilities must work **cross-platform** with the same libraries:
macOS, Windows, iOS, Android, visionOS, Quest — desktop and mobile browsers.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    PORTALS APP                           │
│                                                          │
│  ┌──────────────┐         ┌──────────────────────────┐  │
│  │ React Native  │◄──────►│   Unity (as library)      │  │
│  │  (UI/Logic)   │ bridge │  (3D/Spatial Rendering)   │  │
│  └──────┬───────┘  JSON   └──────────────────────────┘  │
│         │                                                │
│  ┌──────▼────────────────────────────────────────────┐  │
│  │          Spatial Intelligence Layer                 │  │
│  │                                                    │  │
│  │  MediaPipe ─── hand/body/face/gesture/object       │  │
│  │  TFLite    ─── custom model runtime                │  │
│  │  OpenCV    ─── image processing, markers           │  │
│  └──────┬────────────────────────────────────────────┘  │
│         │                                                │
│  ┌──────▼────────────────────────────────────────────┐  │
│  │          Platform-Specific Spatial Layer            │  │
│  │  (abstracted via Unity AR Foundation)               │  │
│  │                                                    │  │
│  │  iOS/visionOS ─── ARKit (planes, depth, LiDAR)    │  │
│  │  Android      ─── ARCore (planes, depth, geo)     │  │
│  │  Quest        ─── Meta SDK (hands, body, passthru)│  │
│  │  Web          ─── WebXR + MediaPipe WASM          │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │          Voice + LLM + Memory Layer                 │  │
│  │                                                    │  │
│  │  STT ─── Groq Whisper (free) / Web Speech API     │  │
│  │  LLM ─── Groq Llama 3.3 70B (free) → Gemini      │  │
│  │  TTS ─── Edge TTS (free) → macOS say              │  │
│  │  Mem ─── Long-term KB (jARvis OTALA cycle)        │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Core Modules

### 3.1 MediaPipe (Primary — All Platforms)

**What**: Google's on-device ML framework. Handles 4 of 5 core requirements in one SDK.

| Capability | Details |
|-----------|---------|
| Hand Tracking | 21 3D landmarks per hand, real-time |
| Gesture Recognition | Pointing, thumbs up, finger counting, custom gestures |
| Full Body Tracking | 33 pose landmarks (BlazePose) |
| Face Tracking | 468 facial landmarks + blendshapes |
| Object Detection | Built-in detector, custom models via Model Maker |
| Holistic Mode | 540+ keypoints in one pass (hands + body + face) |

**Platforms**: iOS, Android, macOS, Windows, Web (WASM + WebGL)
**Cost**: Free (Apache 2.0)
**Performance**: Hand detection ~2.3ms, 30-60 FPS on mobile, 30+ FPS in browser
**Bundle**: 5-15MB (models loaded on-demand from CDN)

**Integration**:
- React Native: `react-native-mediapipe` (community, iOS + Android)
- Unity: `MediaPipeUnityPlugin` by homuler (Unity 2022.3+)
- Web: Official JavaScript SDK via npm/CDN

### 3.2 TensorFlow Lite / LiteRT (Custom Model Runtime)

**What**: Model execution engine for when MediaPipe's built-in models aren't enough.

**Use for**: Custom object classifiers, scene understanding models, specialized gesture models.
**Cost**: Free (Apache 2.0)
**Integration**: `react-native-fast-tflite` (GPU-accelerated, 30+ inferences/sec)

### 3.3 OpenCV (Image Processing Layer)

**What**: Computer vision toolkit for preprocessing, camera calibration, ArUco markers.

**Use for**: Image transforms, marker-based tracking, camera calibration, feature detection.
**Cost**: Free (Apache 2.0). Unity plugin: $95 one-time (Enox Software).
**Integration**: `react-native-fast-opencv` (JSI C++ bridge)

### 3.4 Platform-Specific (via Unity AR Foundation)

| Platform | SDK | Adds |
|----------|-----|------|
| iOS/visionOS | ARKit | Plane detection, scene reconstruction, LiDAR depth, world tracking |
| Android | ARCore | Plane detection, depth API, scene semantics, geospatial anchors |
| Quest | Meta SDK | Native hand tracking (25 joints), body tracking, passthrough |
| Web/Quest Browser | WebXR | Hand tracking (25 joints), spatial tracking, hit testing |

Unity AR Foundation abstracts ARKit + ARCore behind one API.

---

## 4. What We're NOT Using (and Why)

| Library | Reason to Skip |
|---------|---------------|
| **YOLO** | AGPL license = must open-source entire app, or pay $5K+/yr. MediaPipe object detection covers most cases. |
| **Gemini Nano / Edge AI** | Text/language model only — cannot do hand tracking, body tracking, or object detection. Chrome-only. |
| **ARKit alone** | Apple-only. Not cross-platform. |
| **ARCore alone** | Google-only. Not cross-platform. |
| **OpenPose** | Superseded by MediaPipe. Less maintained, heavier. |

---

## 5. Cost Breakdown

| Component | Cost |
|-----------|------|
| MediaPipe | Free |
| TFLite/LiteRT | Free |
| OpenCV | Free ($95 for Unity plugin) |
| ARKit | Free (with $99/yr Apple Dev) |
| ARCore | Free |
| Meta Quest SDK | Free |
| WebXR | Free |
| Groq Whisper STT | Free |
| Groq Llama 3.3 70B | Free |
| Edge TTS | Free |
| **Total** | **$95 one-time + $99/yr Apple Dev** |

---

## 6. Data Flow: Spatial → Voice → LLM → Unity

```
 Camera Feed ──► MediaPipe ──► Spatial State (JSON)
                                    │
 Microphone ───► STT (Groq) ──► Voice Text
                                    │
                              ┌─────▼──────┐
                              │  Jarvis LLM │
                              │  (Groq Free)│
                              │             │
                              │  Inputs:    │
                              │  - spatial  │
                              │  - voice    │
                              │  - memory   │
                              │  - context  │
                              └─────┬──────┘
                                    │
                              JSON Commands
                                    │
                              ┌─────▼──────┐
                              │ Unity Bridge│
                              │ { type, ... }│
                              └─────┬──────┘
                                    │
                              Unity Renderer
                              (3D scene updates)
```

### Spatial State Object

```json
{
  "hands": {
    "left": { "landmarks": [[x,y,z]...], "gesture": "pointing", "confidence": 0.95 },
    "right": { "landmarks": [[x,y,z]...], "gesture": "open_palm", "confidence": 0.92 }
  },
  "body": {
    "landmarks": [[x,y,z]...],
    "pose": "standing"
  },
  "face": {
    "landmarks": [[x,y,z]...],
    "expression": "neutral"
  },
  "objects": [
    { "label": "cup", "bbox": [x,y,w,h], "confidence": 0.88 },
    { "label": "laptop", "bbox": [x,y,w,h], "confidence": 0.94 }
  ],
  "scene": {
    "planes": [{ "type": "floor", "center": [x,y,z], "size": [w,h] }],
    "lighting": "indoor_bright"
  }
}
```

---

## 7. Unity Bridge Protocol

Following the existing Portals V4 bridge pattern: **flat JSON `{ type, ...payload }`**.

### New Spatial Message Types

```javascript
// Hand tracking data → Unity
{ type: "hand_tracking_data", hand: "left", landmarks: [...], gesture: "pointing" }
{ type: "hand_tracking_data", hand: "right", landmarks: [...], gesture: "open_palm" }

// Body tracking data → Unity
{ type: "body_tracking_data", landmarks: [...], pose: "standing" }

// Object detection results → Unity
{ type: "object_detected", label: "cup", bbox: [x,y,w,h], confidence: 0.88, worldPos: [x,y,z] }

// Gesture commands → Unity (high-level)
{ type: "gesture_command", gesture: "point_at", target: [x,y,z], hand: "right" }
{ type: "gesture_command", gesture: "grab", target: "obj_123", hand: "left" }
{ type: "gesture_command", gesture: "pinch_zoom", scale: 1.5 }
{ type: "gesture_command", gesture: "finger_count", count: 3, action: "set_mode" }

// Scene understanding → Unity
{ type: "scene_update", planes: [...], anchors: [...], lightEstimate: { intensity, color } }

// Voice + spatial combined → Unity
{ type: "spatial_voice_command", text: "put a red cube on the table",
  spatialContext: { nearestPlane: "table", handPointing: [x,y,z] } }
```

### Existing Types (84 already defined in Portals V4)

Scene (7), VFX (6), Holograms (5), Paint (8), Materials (4), Animations (3),
Formations (2), Wires (3), Components (3), Filters (3), Assets (2), System (11),
AR Tracking (8) — all use same `{ type, ...payload }` format.

### Semantic Actions (extend existing 19 types)

```typescript
// New spatial semantic action types
type SpatialActionType =
  | 'POINT_AT'        // user pointing at something
  | 'GRAB_OBJECT'     // grab gesture on virtual object
  | 'PLACE_OBJECT'    // place at spatial anchor
  | 'SCALE_OBJECT'    // pinch-to-scale gesture
  | 'ROTATE_OBJECT'   // rotation gesture
  | 'GESTURE_MODE'    // finger count → mode switch
  | 'SPATIAL_QUERY'   // "what's that?" + point direction
  | 'TRACK_BODY'      // body-driven avatar
  | 'FACE_DRIVE'      // face expression → avatar face
```

---

## 8. Implementation Phases

### Phase 1: MediaPipe Core (Week 1)

```
src/spatial/
  mediapipe-loader.mjs     — Load MediaPipe WASM models
  hand-tracker.mjs         — Hand pose + gesture recognition
  body-tracker.mjs         — Full body tracking (33 landmarks)
  gesture-engine.mjs       — Gesture classification (point, grab, pinch, count)
  spatial-state.mjs        — Aggregate all tracking into unified state
```

**Deliverable**: Camera feed → hand/body tracking → gesture recognition → JSON state.
**Verify**: Open browser, see hand landmarks overlay, gesture label updates in real-time.

### Phase 2: Voice + Spatial Fusion (Week 2)

```
src/spatial/
  spatial-voice-fuser.mjs  — Combine voice text + spatial context
  spatial-memory.mjs       — Long-term spatial preferences/patterns
  command-synthesizer.mjs  — Generate Unity bridge JSON from fused input
```

**Deliverable**: "Put a cube there" + point gesture → `{ type: "add_object", position: [pointed location] }`.
**Verify**: Voice command + hand gesture → object appears at pointed location in Unity.

### Phase 3: Object Detection (Week 3)

```
src/spatial/
  object-detector.mjs      — MediaPipe/custom object detection
  scene-understanding.mjs  — Plane detection, spatial mapping
  object-tracker.mjs       — Track objects across frames
```

**Deliverable**: Camera detects real-world objects, Jarvis can reference them.
**Verify**: "Put a virtual hat on that cup" → object detected, virtual content placed.

### Phase 4: Unity Integration (Week 4)

```
src/spatial/
  unity-spatial-bridge.mjs — Send spatial data to Unity
  ar-foundation-adapter.mjs — Platform-specific AR features

# Unity side (C#)
Assets/Scripts/Spatial/
  SpatialBridgeHandler.cs  — Receive & process spatial messages
  HandVisualizer.cs        — Render hand skeleton in 3D
  GestureExecutor.cs       — Execute gesture commands on scene
```

**Deliverable**: Full loop working in Portals app — React Native MediaPipe → Unity rendering.
**Verify**: Gesture in real world → 3D response in mixed reality view.

### Phase 5: Cross-Platform Polish (Week 5)

- visionOS: ARKit hand tracking + MediaPipe fallback
- Quest: Meta SDK hand tracking + MediaPipe body tracking
- Web: WebXR + MediaPipe WASM for all browsers
- Test matrix across all 7 target platforms

---

## 9. Platform Coverage Matrix

| Capability | iOS | Android | macOS | Windows | visionOS | Quest | Web |
|-----------|-----|---------|-------|---------|----------|-------|-----|
| Hand Tracking | MP | MP | MP | MP | ARKit+MP | Meta+MP | WebXR+MP |
| Body Tracking | MP | MP | MP | MP | MP | Meta+MP | MP |
| Face Tracking | MP | MP | MP | MP | ARKit | MP | MP |
| Gesture Control | MP | MP | MP | MP | ARKit+MP | Meta+MP | WebXR+MP |
| Object Detection | MP | MP | MP | MP | MP | MP | MP |
| Plane Detection | ARKit | ARCore | — | — | ARKit | Meta | WebXR |
| Scene Depth | ARKit | ARCore | — | — | ARKit | Meta | — |
| World Tracking | ARKit | ARCore | — | — | ARKit | Meta | WebXR |

**MP** = MediaPipe, **ARKit/ARCore/Meta** = platform-native SDK

---

## 10. File Structure (Final)

```
packages/spatial-intelligence/
  package.json                    — @xrai/spatial-intelligence
  index.mjs                       — Main entry, createSpatialEngine()
  mediapipe-loader.mjs            — MediaPipe model loading
  hand-tracker.mjs                — Hand pose tracking
  body-tracker.mjs                — Body pose tracking
  face-tracker.mjs                — Face tracking
  gesture-engine.mjs              — Gesture classification
  object-detector.mjs             — Object detection
  scene-understanding.mjs         — Spatial scene analysis
  spatial-state.mjs               — Unified state aggregator
  spatial-voice-fuser.mjs         — Voice + spatial context fusion
  spatial-memory.mjs              — Long-term spatial memory
  command-synthesizer.mjs         — JSON command generation
  unity-spatial-bridge.mjs        — Unity bridge integration
  platform/
    ar-foundation-adapter.mjs     — ARKit/ARCore abstraction
    webxr-adapter.mjs             — WebXR fallback
    meta-quest-adapter.mjs        — Quest-specific features
  config.mjs                      — Default configuration
```

**This is a standalone package** — droppable into any project (web, React Native, Unity).

---

## 11. Principles (Constitution)

1. **Free first**: Never use a paid API when a free alternative exists.
2. **Cross-platform**: Same code, same libraries, every platform.
3. **Standalone modules**: Each package is independently installable and swappable.
4. **JSON protocol**: All inter-system communication is flat JSON `{ type, ...payload }`.
5. **Edge-first**: Process on-device. Cloud only as fallback.
6. **Privacy by design**: Camera/mic data stays on device. Only commands cross the wire.
7. **No vendor lock-in**: MediaPipe + TFLite + OpenCV = all Apache 2.0 open source.
8. **Voice is primary**: Everything should be achievable by voice + gesture, no menus.
9. **Memory matters**: Jarvis remembers your preferences, context, and spatial patterns.
10. **Ship tested code**: Every module has tests. Every commit passes CI.

---

*Generated by Jarvis + Claude Code — 2026-03-09*
