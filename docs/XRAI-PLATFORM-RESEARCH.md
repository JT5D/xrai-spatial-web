# XRAI Platform — Compiled Research & Implementation Roadmap

> Compiled 2026-03-09 from parallel research across XRAI Knowledge Base, Portals V4 codebase, and WebXR/WebGPU ecosystem.

---

## Executive Summary

Three parallel research efforts completed:
1. **XRAI Knowledge Base** (imclab/xrai) — 300+ files, 8,302 semantic chunks, covering visualization patterns, XRAI format spec, cross-platform architecture
2. **Portals V4** — 16 extractable modules, 52 bridge message types, zero-dep wire system, self-healing jARvis agent
3. **WebXR/WebGPU Ecosystem** — Full comparison of Needle, Rerun, PlayCanvas, SuperSplat, Three.js WebGPU, R3F, Babylon.js

**Primary stack recommendation:** React Three Fiber + Three.js WebGPU (MIT, production-ready, largest ecosystem)

---

## Part 1: Technology Stack Decision

### Recommended Primary Stack

| Layer | Technology | License | Why |
|-------|-----------|---------|-----|
| **Rendering** | Three.js r171+ WebGPU | MIT | Production-ready, 2-10x over WebGL, 95% browser support |
| **Framework** | React Three Fiber v9 | MIT | Declarative 3D, hooks, largest ecosystem |
| **XR** | @react-three/xr v6+ | MIT | Hand tracking, mesh/plane detection, Quest + Vision Pro |
| **VFX** | r3f-vfx / wawa-vfx | OSS | WebGPU compute shader particles |
| **Shaders** | TSL (Three Shading Language) | MIT | Write once, runs WGSL + GLSL |
| **State** | zustand | MIT | Standard in pmndrs ecosystem |
| **Physics** | @react-three/rapier | MIT | Rust-based, fast |

### Supplementary Tools

| Need | Tool | Notes |
|------|------|-------|
| Multimodal data viz | Rerun.io | MIT+Apache, WebGPU, React component |
| Unity artist pipeline | Needle Engine | EUR 49/mo Pro, Three.js-based |
| Gaussian splats | SuperSplat | MIT, PlayCanvas-based |
| Simple 3D embeds | model-viewer | Apache 2.0, web component |
| Graph viz (2D/3D) | 3d-force-graph | MIT, up to 100K nodes |
| Dashboard analytics | ECharts-GL | Apache, GPU-accelerated |

### WebGPU Browser Support (2026)

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 113+ | Full since 2023 |
| Safari | 26+ | Full since Sept 2025 |
| Firefox | 141+ | Full since July 2025 |
| Edge | All | Full |
| Linux | Rolling out | Partial |

### Performance Benchmarks

| Metric | WebGL | WebGPU | Improvement |
|--------|-------|--------|-------------|
| Draw calls | 1x | 2-10x | Render bundles |
| Particles | 10K | 400K+ @ 60fps | Compute shaders |
| Gaussian splats (6M pts) | ~15-30ms | ~0.6ms | 25-50x |

---

## Part 2: XRAI Knowledge Base Findings

### Repository: imclab/xrai (not IMC-lab)

Local: `/Users/jamestunick/Documents/GitHub/Unity-XR-AI/`
KB Symlink: `/Users/jamestunick/KnowledgeBase/`

### Key Documents for Implementation

| Document | Path | Covers |
|----------|------|--------|
| 3D Visualization KB | `_3D_VISUALIZATION_KNOWLEDGEBASE.md` | CosmosVisualizer, layouts, performance tiers |
| DataViz Hub Patterns | `_DATAVIZ_HUB_PATTERNS.md` | ECharts-GL, ForceAtlas2, GPU tier detection |
| Viz Resources Index | `_VISUALIZATION_RESOURCES_INDEX.md` | 12+ tools matrix with max nodes |
| WebGL 3D Patterns | `_WEBGL_3D_VISUALIZATION_PATTERNS.md` | 3d-force-graph API, MCP tools, WebGPU particles |
| WebGPU + Three.js | `_WEBGPU_THREEJS_2025.md` | TSL, migration, R3F v9 WebGPU |
| Needle Strategy | `_STRATEGY_NEEDLE_WEB_INTEGRATION.md` | Web-first via WebGPU, Needle for networking |
| Rerun vs Metavido | `_AR_RECORDING_COMPARISON_METAVIDO_VS_RERUN.md` | Format comparison, use cases |
| Gaussian Splatting | `_GAUSSIAN_SPLATTING_AND_VIZ_TOOLS.md` | SuperSplat, capture pipelines |
| HCI Spatial Design | `_HCI_SPATIAL_DESIGN_PRINCIPLES.md` | Attention hierarchy, working memory limits |
| Cross-Platform Arch | `_CROSS_PLATFORM_ARCHITECTURE_RESEARCH_2026.md` | 5 architecture patterns |
| XRAI Format | `_XRAI_FORMAT_RESEARCH_2026.md` | glTF 2.0 based, generative encoding |

### Performance Tiers (from KB)

| Node Count | Rendering Strategy |
|------------|-------------------|
| <1K | Full DOM labels |
| 1K-10K | Instanced meshes |
| 10K-100K | GPU particles |
| 100K+ | Compute shaders (WebGPU) |
| 1M+ | GraphPU (Rust/WGPU) Barnes-Hut |

### Graphics Tiering Strategy

| Feature | Tier 1: Native | Tier 2: WebGPU | Tier 3: WebGL 2 |
|---------|---------------|----------------|-----------------|
| Particles | 1,000,000+ | 500,000 | 10,000 |
| VFX Graph | Full | Full | Not Supported |
| Simulation | Real-time Fluid | Simplified Boids | Static/Baked |

---

## Part 3: Portals V4 Extractable Modules

### Module Inventory (16 modules, ranked by portability)

| # | Module | LOC | Deps | Portability | Extraction |
|---|--------|-----|------|-------------|------------|
| 1 | Wire System | ~500 | **None** | ★★★★★ | Trivial |
| 2 | Audio Analysis | ~400 | Web Audio | ★★★★★ | Low |
| 3 | jARvis Agent (OTALA) | ~500 | AsyncStorage | ★★★★★ | Low |
| 4 | Voice Intelligence | ~1500 | Firebase, Gemini | ★★★★★ | Low |
| 5 | XRAI Voice Bridge | ~400 | WebSocket | ★★★★★ | Low |
| 6 | Scene Serialization | ~800 | Firebase, R2 | ★★★★★ | Low |
| 7 | Material Pool | ~210 | Viro | ★★★★ | Low |
| 8 | Hologram Service | ~200 | Firebase, R2 | ★★★★ | Low |
| 9 | Asset Providers | ~600 | Firebase | ★★★★ | Low |
| 10 | Hand Tracking | ~2000 | AR Foundation | ★★★★ | Medium |
| 11 | Body Tracking | ~1500 | AR Foundation | ★★★★ | Medium |
| 12 | Face Tracking | ~800 | AR Foundation | ★★★★ | Medium |
| 13 | Paint System | ~1500 | Viro, AR | ★★★★ | Medium |
| 14 | VFX System | ~3000 | Unity VFX Graph | ★★★★ | Medium |
| 15 | Animation System | ~600 | Unity Animator | ★★★★ | Low |
| 16 | Icosa Gallery | ~300 | REST API | ★★★★ | Low |

### Bridge Protocol

- **52 typed messages** (22 inbound, 20 outbound, 10 helper)
- Wire format: flat JSON `{ type, ...payload }`
- File: `/Users/jamestunick/dev/portals_v4_fresh/src/types/bridge.ts`

### Wire System (Zero Dependencies)

```javascript
// 50-line reactive binding engine
tick(sources, targets) {
  for (const wire of this.wires) {
    let v = this.get(wire.src, sources);
    v = this.mod(v, wire.mod);
    this.set(wire.tgt, v, targets);
  }
}
// Wire: { src: "audio.bass", mod: "scale:0.5", tgt: "cube.scale.y" }
```

Modifiers: scale, offset, invert, sin, clamp, step, smooth

### jARvis OTALA Cycle

```
OBSERVE → Read KB health nodes, queue depth, voice state
THINK   → Evaluate rules sorted by confidence
ACT     → Execute fired actions (max 5/tick)
LEARN   → Record outcomes, adjust confidence
ASSESS  → Multi-dimensional health check
```

Self-healing, zero LLM cost, pure rule evaluation with confidence compounding.

### Recommended Extraction Sequence

**Phase 1 (No Dependencies):** Wire System, Audio Analysis, Material Pool
**Phase 2 (Firebase only):** jARvis Agent, Scene Serialization, Hologram Service
**Phase 3 (Complex):** Voice Intelligence, XRAI Agent Bridge
**Phase 4 (AR Context):** Paint, Hand/Body/Face Tracking, VFX

---

## Part 4: XRAI Format Specification

### Format Decision: glTF 2.0 Based

From KB research (`_XRAI_FORMAT_RESEARCH_2026.md`):
- NVIDIA, Apple, Google, Meta all converging on glTF 2.0
- Khronos extending 2.0 indefinitely (no 3.0 planned)
- Extension registry: XRAI_core, XRAI_generators, XRAI_vfx, XRAI_ai, XRAI_spatial, XRAI_collaboration, XRAI_reactive

### Generative Encoding Innovation

Forest of 1000 trees: 50MB explicit vs 80KB generative (**625:1 ratio**)
"Simple rules, infinite complexity" — DNA-like seeds that expand to full environments.

### Hypergraph-to-World Pipeline

```
Knowledge Graph (MCP Memory, Neo4j, Obsidian)
  → Semantic Zoom: Universe → Planet → City → Building → Room → Detail
  → Layout: force-directed | hierarchical | geographic | semantic (AI)
  → Live sync: watch changes, animate additions/removals
```

---

## Part 5: Prioritized Implementation Roadmap

### Priority 1: Foundation (Basics First)

These are the "basics" — hand tracking, voice control, data visualization — that must work before anything else.

#### 1a. Voice Control (Already Partially Done)
- [x] Jarvis daemon with STT + TTS (Groq Whisper + Edge TTS)
- [x] Tool execution (shell, browser, files, memory)
- [x] Shared memory for agent coordination
- [ ] Web browser voice input (Web Speech API / Whisper)
- [ ] Voice-to-visualization commands ("show me as a force graph", "filter by type")

#### 1b. Data Visualization Core
- [ ] Three.js WebGPU renderer setup (import from 'three/webgpu')
- [ ] Force-directed graph layout (3d-force-graph or custom)
- [ ] Node type rendering (page, heading, media, link-group)
- [ ] Edge/link visualization
- [ ] Camera controls (orbit, zoom, fly-to-node)
- [ ] Performance tiering (instanced meshes → GPU particles by count)

#### 1c. Hand Tracking (Web)
- [ ] MediaPipe Hands integration via @mediapipe/hands or @mediapipe/tasks-vision
- [ ] 21-joint hand skeleton rendering
- [ ] Pinch gesture detection (thumb-index distance)
- [ ] Point gesture (index extended)
- [ ] Grab gesture (all fingers closed)
- [ ] Hand-to-graph interaction (pinch to select node, grab to move)

### Priority 2: View Modes & Filters

#### 2a. View Registry
- [ ] Plugin interface: { name, generate, update, clear, dispose }
- [ ] Force Graph as first registered view
- [ ] MediaCity layout (exploded media view)
- [ ] Newspaper layout (hierarchical sections)

#### 2b. Filter Engine
- [ ] Composable faceted filtering pipeline
- [ ] Type filter (heading, media, link-group, etc.)
- [ ] Date range filter
- [ ] Author filter
- [ ] Saved filter presets

### Priority 3: Enhanced Extraction

#### 3a. Richer Metadata
- [ ] Code blocks extraction
- [ ] Table extraction
- [ ] Author avatars
- [ ] Video thumbnails
- [ ] Related articles
- [ ] Social graph (who links to whom)

### Priority 4: Multiplayer & Collaboration

#### 4a. Room System
- [ ] WebSocket room manager (reuse cosmos-needle-web pattern)
- [ ] Shared state model (searchQuery, graphData, mode, layout)
- [ ] Avatar management (position, color, label)
- [ ] Presence indicators

### Priority 5: Advanced Features

- [ ] XRAI format serialize/deserialize (glTF 2.0 based)
- [ ] Wire system port from Portals V4
- [ ] Gaussian splat viewer (SuperSplat integration)
- [ ] Rerun.io embedded viewer for sensor data
- [ ] jARvis OTALA cycle port for self-healing
- [ ] WebXR immersive mode (@react-three/xr)

---

## Part 6: Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                    XRAI Platform                     │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Voice    │  │ Hand     │  │ Data Extraction  │  │
│  │ Control  │  │ Tracking │  │ (extractor.mjs)  │  │
│  │ (Jarvis) │  │ (MediaP) │  │                  │  │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│       │              │                 │             │
│       ▼              ▼                 ▼             │
│  ┌──────────────────────────────────────────────┐   │
│  │           Filter Engine (composable)          │   │
│  └──────────────────────┬───────────────────────┘   │
│                         │                            │
│                         ▼                            │
│  ┌──────────────────────────────────────────────┐   │
│  │    View Registry (pluggable layout modes)     │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌───────┐ │   │
│  │  │ Force  │ │ Media  │ │ News-  │ │ Code  │ │   │
│  │  │ Graph  │ │ City   │ │ paper  │ │ Intel │ │   │
│  │  └────────┘ └────────┘ └────────┘ └───────┘ │   │
│  └──────────────────────┬───────────────────────┘   │
│                         │                            │
│                         ▼                            │
│  ┌──────────────────────────────────────────────┐   │
│  │  Three.js WebGPU (R3F) + TSL Shaders         │   │
│  │  ┌─────────┐ ┌────────┐ ┌──────────────────┐│   │
│  │  │ Instanc │ │ GPU    │ │ Compute Shaders  ││   │
│  │  │ Meshes  │ │ Partcl │ │ (100K+ nodes)    ││   │
│  │  └─────────┘ └────────┘ └──────────────────┘│   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Wire     │  │ Shared   │  │ Activity Log     │  │
│  │ System   │  │ Memory   │  │ (observability)  │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  Agent Layer                                  │   │
│  │  Jarvis (Groq) ←→ Shared Memory ←→ Claude    │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## Appendix: Key File Paths

### Current Project (xrai-spatial-web)
- Server: `/Users/jamestunick/Applications/web-scraper/src/server/index.mjs`
- Extractor: `/Users/jamestunick/Applications/web-scraper/src/extractor.mjs`
- Daemon: `/Users/jamestunick/Applications/web-scraper/src/daemon/jarvis-listen.mjs`
- Tools: `/Users/jamestunick/Applications/web-scraper/src/daemon/jarvis-tools.mjs`
- Shared Memory: `/tmp/jarvis-daemon/shared-memory.json`
- Activity Log: `/tmp/jarvis-daemon/activity-log.jsonl`

### Portals V4 (extractable modules)
- Bridge types: `/Users/jamestunick/dev/portals_v4_fresh/src/types/bridge.ts`
- Wire system: `/Users/jamestunick/dev/portals_v4_fresh/src/lib/wire-interpreter.js`
- jARvis agent: `/Users/jamestunick/dev/portals_v4_fresh/src/services/jarvis/`
- Voice Intel: `/Users/jamestunick/dev/portals_v4_fresh/src/services/voice-intelligence/`
- Voice Bridge: `/Users/jamestunick/dev/portals_v4_fresh/src/services/xrai-voice-agent/`

### Knowledge Base
- Local: `/Users/jamestunick/KnowledgeBase/`
- GitHub: `imclab/xrai` (note: lowercase imclab)
- CDN: `https://cdn.jsdelivr.net/gh/imclab/xrai@main/KnowledgeBase/`
