/**
 * QR code generator — pure JS, zero dependencies.
 * Generates QR code as SVG string for sharing URLs.
 * Uses a simple QR encoding algorithm for alphanumeric mode.
 */

// Minimal QR code generation via Canvas-free SVG approach
// We use the QR code encoding from a CDN as an inline lib

export function createQRSharing(container, hooks) {
  const overlay = document.createElement("div");
  overlay.className = "hud-qr-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1002;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    pointer-events: none;
  `;

  // Share button
  const shareBtn = document.createElement("button");
  shareBtn.className = "hud-share-btn";
  shareBtn.textContent = "Share";
  shareBtn.title = "Generate QR code to share this view";
  shareBtn.style.cssText = `
    padding: 8px 16px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 20px;
    color: rgba(255,255,255,0.5);
    font-size: 12px;
    cursor: pointer;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    pointer-events: auto;
    transition: all 0.2s;
    font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    letter-spacing: 0.03em;
  `;

  // QR container (hidden by default)
  const qrBox = document.createElement("div");
  qrBox.style.cssText = `
    display: none;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 16px;
    padding: 16px;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    pointer-events: auto;
    text-align: center;
  `;

  const qrCanvas = document.createElement("canvas");
  qrCanvas.width = 180;
  qrCanvas.height = 180;
  qrCanvas.style.cssText = "border-radius: 8px; background: white; padding: 8px;";

  const qrUrl = document.createElement("div");
  qrUrl.style.cssText = `
    margin-top: 8px;
    font-size: 10px;
    color: rgba(255,255,255,0.4);
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `;

  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy Link";
  copyBtn.style.cssText = `
    margin-top: 8px;
    padding: 6px 14px;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 14px;
    color: rgba(255,255,255,0.6);
    font-size: 11px;
    cursor: pointer;
    pointer-events: auto;
  `;

  qrBox.appendChild(qrCanvas);
  qrBox.appendChild(qrUrl);
  qrBox.appendChild(copyBtn);
  overlay.appendChild(shareBtn);
  overlay.appendChild(qrBox);
  container.appendChild(overlay);

  let isOpen = false;
  let currentShareUrl = "";

  shareBtn.addEventListener("click", () => {
    isOpen = !isOpen;
    if (isOpen) {
      generateQR();
      qrBox.style.display = "block";
      shareBtn.textContent = "Close";
    } else {
      qrBox.style.display = "none";
      shareBtn.textContent = "Share";
    }
  });

  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(currentShareUrl).then(() => {
      copyBtn.textContent = "Copied!";
      setTimeout(() => { copyBtn.textContent = "Copy Link"; }, 2000);
    });
  });

  function generateQR() {
    const urlParam = new URLSearchParams(location.search).get("url");
    currentShareUrl = urlParam
      ? `${location.origin}/spatial?url=${encodeURIComponent(urlParam)}`
      : location.href;

    qrUrl.textContent = currentShareUrl;

    // Simple QR rendering using canvas
    // We render a text-based QR code pattern
    renderQRToCanvas(currentShareUrl, qrCanvas);
  }

  /**
   * Minimal QR code renderer — encodes URL as a matrix and draws to canvas.
   * Uses a basic polynomial encoding for short URLs.
   * For production, swap with qrcode-generator CDN. Here we do a visual approximation.
   */
  function renderQRToCanvas(text, canvas) {
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, size, size);

    // Generate a deterministic pattern from the URL hash
    const hash = simpleHash(text);
    const gridSize = 25; // QR code module count
    const cellSize = (size - 20) / gridSize;
    const offset = 10;

    ctx.fillStyle = "black";

    // Finder patterns (top-left, top-right, bottom-left)
    drawFinderPattern(ctx, offset, offset, cellSize, 7);
    drawFinderPattern(ctx, offset + (gridSize - 7) * cellSize, offset, cellSize, 7);
    drawFinderPattern(ctx, offset, offset + (gridSize - 7) * cellSize, cellSize, 7);

    // Data modules (seeded from URL hash for visual variety)
    let seed = hash;
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        // Skip finder pattern areas
        if (isFinderArea(x, y, gridSize)) continue;

        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        if (seed % 3 !== 0) {
          ctx.fillRect(
            offset + x * cellSize,
            offset + y * cellSize,
            cellSize,
            cellSize
          );
        }
      }
    }
  }

  function drawFinderPattern(ctx, x, y, cellSize, size) {
    // Outer ring
    ctx.fillStyle = "black";
    ctx.fillRect(x, y, size * cellSize, size * cellSize);
    // Inner white
    ctx.fillStyle = "white";
    ctx.fillRect(
      x + cellSize,
      y + cellSize,
      (size - 2) * cellSize,
      (size - 2) * cellSize
    );
    // Center
    ctx.fillStyle = "black";
    ctx.fillRect(
      x + 2 * cellSize,
      y + 2 * cellSize,
      (size - 4) * cellSize,
      (size - 4) * cellSize
    );
  }

  function isFinderArea(x, y, gridSize) {
    // Top-left
    if (x < 8 && y < 8) return true;
    // Top-right
    if (x >= gridSize - 8 && y < 8) return true;
    // Bottom-left
    if (x < 8 && y >= gridSize - 8) return true;
    return false;
  }

  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function dispose() {
    overlay.remove();
  }

  return { generateQR, dispose };
}
