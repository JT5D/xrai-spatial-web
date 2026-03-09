/**
 * @xrai/voice-agent — standalone voice agent module.
 * Drop into any web project for wake-word-activated voice AI.
 *
 * Usage:
 *   import { createVoiceAgent } from '@xrai/voice-agent';
 *
 *   const agent = createVoiceAgent({
 *     agentName: 'Jarvis',
 *     wakeWords: ['jarvis', 'hey jarvis'],
 *     wsUrl: 'ws://localhost:3210/agent/ws',
 *     baseUrl: 'http://localhost:3210',
 *     autoStart: true,
 *     overlay: true,
 *   });
 *
 *   // Or use individual pieces:
 *   agent.bus       — event bus
 *   agent.input     — voice input (STT + wake word)
 *   agent.output    — voice output (TTS with fallback chain)
 *   agent.bridge    — WebSocket bridge to AI backend
 *   agent.ui        — overlay UI (if enabled)
 *
 *   agent.send('Hello Jarvis');  — send text directly
 *   agent.dispose();             — cleanup everything
 */
import { createEventBus } from "./event-bus.mjs";
import { createVoiceInput } from "./voice-input.mjs";
import { createVoiceOutput } from "./voice-output.mjs";
import { createAgentBridge } from "./agent-bridge.mjs";
import { createAgentOverlay } from "./agent-overlay.mjs";

export function createVoiceAgent(config = {}) {
  const bus = config.bus || createEventBus();

  const input = createVoiceInput(bus, {
    wakeWords: config.wakeWords,
    activeTimeoutMs: config.activeTimeoutMs,
    lang: config.lang,
  });

  const output = createVoiceOutput(bus, {
    baseUrl: config.baseUrl,
  });

  const bridge = createAgentBridge(bus, input, output, {
    wsUrl: config.wsUrl,
    onToolCall: config.onToolCall,
  });

  let ui = null;
  if (config.overlay !== false) {
    ui = createAgentOverlay(bus, {
      container: config.container,
      agentName: config.agentName,
      position: config.position,
      theme: config.theme,
    });
  }

  if (config.autoStart !== false) {
    input.startPassive();
  }

  function send(text) {
    bridge.send(text);
  }

  function dispose() {
    input.dispose();
    output.dispose();
    bridge.dispose();
    if (ui) ui.dispose();
    bus.dispose();
  }

  return {
    bus,
    input,
    output,
    bridge,
    ui,
    send,
    dispose,
  };
}

// Re-export individual pieces for custom compositions
export { createEventBus } from "./event-bus.mjs";
export { createVoiceInput } from "./voice-input.mjs";
export { createVoiceOutput } from "./voice-output.mjs";
export { createAgentBridge } from "./agent-bridge.mjs";
export { createAgentOverlay } from "./agent-overlay.mjs";
export { TTS_PROVIDER, PROVIDER_PRIORITY } from "./tts/provider-interface.mjs";
