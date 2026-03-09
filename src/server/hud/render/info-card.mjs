/**
 * Info card — glass-morphism DOM card floating near the focused node.
 * Uses backdrop-filter: blur for visionOS glass material feel.
 */
import { getTheme } from "../theme/tokens.mjs";

export function createInfoCard(container, camera, renderer, nodesModule, hooks) {
  const theme = getTheme();

  // Create DOM element
  const card = document.createElement("div");
  card.className = "hud-info-card";
  card.innerHTML = `
    <div class="hud-info-title"></div>
    <div class="hud-info-type"></div>
    <div class="hud-info-body"></div>
  `;
  card.style.cssText = `
    position: fixed;
    display: none;
    width: var(--hud-card-width, 320px);
    max-height: var(--hud-card-max-height, 400px);
    overflow-y: auto;
    padding: var(--hud-card-padding, 20px);
    background: var(--hud-card-surface, rgba(255,255,255,0.06));
    border: 1px solid var(--hud-card-border, rgba(255,255,255,0.12));
    border-radius: var(--hud-card-radius, 16px);
    backdrop-filter: blur(var(--hud-card-blur, 20px));
    -webkit-backdrop-filter: blur(var(--hud-card-blur, 20px));
    color: var(--hud-card-text, #e0e0e0);
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    pointer-events: auto;
    z-index: 1000;
    opacity: 0;
    transition: opacity 0.2s ease;
  `;
  container.appendChild(card);

  const titleEl = card.querySelector(".hud-info-title");
  const typeEl = card.querySelector(".hud-info-type");
  const bodyEl = card.querySelector(".hud-info-body");

  // Style sub-elements
  titleEl.style.cssText = "font-size: 15px; font-weight: 600; margin-bottom: 4px;";
  typeEl.style.cssText = "font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.5; margin-bottom: 12px;";

  let activeNodeId = null;

  function show(nodeId) {
    const mesh = nodesModule.getMeshById(nodeId);
    if (!mesh) return;

    activeNodeId = nodeId;
    const node = mesh.userData.nodeData;

    titleEl.textContent = node.label || node.id;
    typeEl.textContent = node.type;
    bodyEl.innerHTML = renderBody(node);

    card.style.display = "block";
    requestAnimationFrame(() => {
      card.style.opacity = "1";
    });
  }

  function hide() {
    card.style.opacity = "0";
    activeNodeId = null;
    setTimeout(() => {
      if (!activeNodeId) card.style.display = "none";
    }, 200);
  }

  function renderBody(node) {
    const d = node.data || {};
    const parts = [];

    if (d.description) parts.push(`<p>${escHtml(d.description)}</p>`);
    if (d.url) parts.push(`<p style="opacity:0.5;word-break:break-all">${escHtml(d.url)}</p>`);
    if (d.key && d.value) parts.push(`<p><strong>${escHtml(d.key)}:</strong> ${escHtml(String(d.value))}</p>`);
    if (d.tag) parts.push(`<p>Tag: ${escHtml(d.tag)}</p>`);
    if (d.href) parts.push(`<p style="opacity:0.5;word-break:break-all">${escHtml(d.href)}</p>`);
    if (d.level) parts.push(`<p>Heading level: H${d.level}</p>`);
    if (d.childCount) parts.push(`<p>Sub-headings: ${d.childCount}</p>`);
    if (d.src) parts.push(`<p style="opacity:0.5;word-break:break-all">${escHtml(d.src)}</p>`);
    if (d.alt) parts.push(`<p>Alt: ${escHtml(d.alt)}</p>`);
    if (d.domain) parts.push(`<p>Domain: ${escHtml(d.domain)} (${d.count} links)</p>`);
    if (d.links) {
      parts.push("<ul>" + d.links.map((l) =>
        `<li style="margin:2px 0"><span style="opacity:0.7">${escHtml(l.text)}</span></li>`
      ).join("") + "</ul>");
    }
    if (d.heroImage?.src) {
      parts.push(`<img src="${escHtml(d.heroImage.src)}" style="width:100%;border-radius:8px;margin-top:8px;opacity:0.8" />`);
    }
    if (d.siteName) parts.push(`<p style="opacity:0.4">${escHtml(d.siteName)}</p>`);

    return parts.join("") || "<p style='opacity:0.4'>No additional details</p>";
  }

  function escHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Position card near the focused node (screen-space)
  function updatePosition() {
    if (!activeNodeId) return;
    const mesh = nodesModule.getMeshById(activeNodeId);
    if (!mesh) return;

    const pos = mesh.position.clone().project(camera);
    const hw = renderer.domElement.clientWidth / 2;
    const hh = renderer.domElement.clientHeight / 2;

    const screenX = pos.x * hw + hw;
    const screenY = -pos.y * hh + hh;

    // Offset card to the right of the node
    const cardWidth = card.offsetWidth;
    let left = screenX + 30;
    let top = screenY - card.offsetHeight / 2;

    // Keep on screen
    if (left + cardWidth > window.innerWidth - 16) left = screenX - cardWidth - 30;
    if (top < 16) top = 16;
    if (top + card.offsetHeight > window.innerHeight - 16) top = window.innerHeight - card.offsetHeight - 16;

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  // Hook events
  hooks.on("infocard:show", ({ nodeId }) => show(nodeId));
  hooks.on("infocard:hide", () => hide());

  return { show, hide, updatePosition };
}
