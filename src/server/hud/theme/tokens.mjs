/**
 * Theme token loader — loads, validates, and merges theme JSON.
 * Supports partial overrides deep-merged with default theme.
 */

let currentTheme = null;

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export async function loadTheme(baseUrl) {
  const res = await fetch(`${baseUrl}/hud/theme/default-theme.json`);
  if (!res.ok) throw new Error(`Failed to load default theme: ${res.status}`);
  currentTheme = await res.json();
  return currentTheme;
}

export function mergeTheme(overrides) {
  if (!currentTheme) throw new Error("Default theme not loaded yet");
  currentTheme = deepMerge(currentTheme, overrides);
  return currentTheme;
}

export function getTheme() {
  return currentTheme;
}

export function getToken(path) {
  let value = currentTheme;
  for (const key of path.split(".")) {
    if (value == null) return undefined;
    value = value[key];
  }
  return value;
}

export function parseColor(hex) {
  return parseInt(hex.replace("#", ""), 16);
}

export function injectCSSTokens(theme) {
  const root = document.documentElement;
  const p = theme.palette;
  root.style.setProperty("--hud-bg", p.background);
  root.style.setProperty("--hud-card-surface", p.cardSurface);
  root.style.setProperty("--hud-card-border", p.cardBorder);
  root.style.setProperty("--hud-card-text", p.cardText);
  root.style.setProperty("--hud-focus", p.focusHighlight);
  root.style.setProperty("--hud-card-blur", theme.infoCard.blur);
  root.style.setProperty("--hud-card-radius", theme.infoCard.borderRadius);
  root.style.setProperty("--hud-card-padding", theme.infoCard.padding);
  root.style.setProperty("--hud-card-width", theme.infoCard.width);
  root.style.setProperty("--hud-card-max-height", theme.infoCard.maxHeight);
}
