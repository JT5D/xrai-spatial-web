/**
 * Filter Panel — right-side slide-out with faceted checkboxes/sliders.
 *
 * Toggle button (funnel icon) in top-right. Reads filter engine facets
 * to generate controls. Updates filters on change via hooks.
 */

export function createFilterPanel(container, filterEngine, hooks) {
  let panel = null;
  let toggleBtn = null;
  let open = false;

  function build() {
    // Toggle button
    toggleBtn = document.createElement("button");
    toggleBtn.className = "xrai-filter-toggle";
    toggleBtn.innerHTML = `<style>
      .xrai-filter-toggle {
        position: fixed;
        top: 16px;
        right: 16px;
        width: 40px;
        height: 40px;
        background: rgba(10, 10, 20, 0.85);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(79, 195, 247, 0.2);
        border-radius: 10px;
        color: rgba(255, 255, 255, 0.6);
        font-size: 18px;
        cursor: pointer;
        z-index: 1001;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      .xrai-filter-toggle:hover { color: #4fc3f7; border-color: rgba(79,195,247,0.4); }
      .xrai-filter-toggle.active { color: #4fc3f7; background: rgba(79,195,247,0.15); }
    </style>&#9776;`;
    toggleBtn.addEventListener("click", toggle);
    container.appendChild(toggleBtn);

    // Panel
    panel = document.createElement("div");
    panel.className = "xrai-filter-panel";
    panel.innerHTML = `<style>
      .xrai-filter-panel {
        position: fixed;
        top: 0;
        right: -320px;
        width: 300px;
        height: 100vh;
        background: rgba(10, 10, 20, 0.92);
        backdrop-filter: blur(16px);
        border-left: 1px solid rgba(79, 195, 247, 0.15);
        z-index: 1000;
        padding: 60px 16px 16px;
        overflow-y: auto;
        transition: right 0.3s;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px;
        color: #e0e0e0;
      }
      .xrai-filter-panel.open { right: 0; }
      .xrai-filter-section { margin-bottom: 18px; }
      .xrai-filter-section h4 {
        margin: 0 0 8px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #4fc3f7;
      }
      .xrai-filter-check {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 3px 0;
        cursor: pointer;
      }
      .xrai-filter-check input { accent-color: #4fc3f7; cursor: pointer; }
      .xrai-filter-check .count {
        margin-left: auto;
        color: rgba(255,255,255,0.3);
        font-size: 11px;
      }
      .xrai-filter-input {
        width: 100%;
        box-sizing: border-box;
        padding: 6px 10px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 6px;
        color: #e0e0e0;
        font-size: 13px;
        outline: none;
      }
      .xrai-filter-input:focus { border-color: rgba(79,195,247,0.5); }
      .xrai-filter-range {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .xrai-filter-range input[type=range] {
        flex: 1;
        accent-color: #4fc3f7;
      }
      .xrai-filter-range .val { font-size: 11px; color: rgba(255,255,255,0.5); min-width: 20px; }
      .xrai-clear-btn {
        width: 100%;
        padding: 8px;
        background: rgba(239, 83, 80, 0.15);
        border: 1px solid rgba(239, 83, 80, 0.3);
        border-radius: 6px;
        color: #ef5350;
        cursor: pointer;
        font-size: 12px;
        margin-top: 8px;
      }
      .xrai-clear-btn:hover { background: rgba(239,83,80,0.25); }
      .xrai-match-count {
        text-align: center;
        padding: 8px;
        color: rgba(255,255,255,0.4);
        font-size: 11px;
      }
    </style>
    <div class="xrai-filter-content"></div>`;
    container.appendChild(panel);

    hooks.on("filter:data-loaded", render);
    hooks.on("filter:changed", render);
    hooks.on("filter:cleared", render);
  }

  function toggle() {
    open = !open;
    panel.classList.toggle("open", open);
    toggleBtn.classList.toggle("active", open);
    if (open) render();
  }

  function render() {
    if (!panel) return;
    const content = panel.querySelector(".xrai-filter-content");
    if (!content) return;
    content.innerHTML = "";

    const facets = filterEngine.getFacets();
    const matchCount = filterEngine.getMatchCount();

    // Match count
    const countEl = document.createElement("div");
    countEl.className = "xrai-match-count";
    countEl.textContent = `${matchCount} nodes matching`;
    content.appendChild(countEl);

    for (const facet of facets) {
      const section = document.createElement("div");
      section.className = "xrai-filter-section";

      const h4 = document.createElement("h4");
      h4.textContent = facet.label;
      section.appendChild(h4);

      if (facet.type === "discrete") {
        buildDiscrete(section, facet);
      } else if (facet.type === "range") {
        buildRange(section, facet);
      } else if (facet.type === "text") {
        buildText(section, facet);
      }

      content.appendChild(section);
    }

    // Clear all button
    const clearBtn = document.createElement("button");
    clearBtn.className = "xrai-clear-btn";
    clearBtn.textContent = "Clear All Filters";
    clearBtn.addEventListener("click", () => filterEngine.clearFilters());
    content.appendChild(clearBtn);
  }

  function buildDiscrete(section, facet) {
    const activeArr = Array.isArray(facet.active) ? facet.active : facet.active ? [facet.active] : [];
    for (const val of (facet.values || []).slice(0, 15)) {
      const label = document.createElement("label");
      label.className = "xrai-filter-check";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = activeArr.includes(val);
      cb.addEventListener("change", () => {
        filterEngine.toggleFilter(facet.name, val);
      });

      const text = document.createTextNode(val);
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = facet.counts?.[val] ?? "";

      label.appendChild(cb);
      label.appendChild(text);
      label.appendChild(count);
      section.appendChild(label);
    }
  }

  function buildRange(section, facet) {
    const wrap = document.createElement("div");
    wrap.className = "xrai-filter-range";

    const minLabel = document.createElement("span");
    minLabel.className = "val";
    minLabel.textContent = facet.min ?? 0;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = facet.min ?? 0;
    slider.max = facet.max ?? 10;
    slider.value = facet.active?.from ?? facet.min ?? 0;
    slider.step = 1;

    const valLabel = document.createElement("span");
    valLabel.className = "val";
    valLabel.textContent = slider.value;

    slider.addEventListener("input", () => {
      valLabel.textContent = slider.value;
      const from = Number(slider.value);
      filterEngine.setFilter(facet.name, { from, to: facet.max });
    });

    wrap.appendChild(minLabel);
    wrap.appendChild(slider);
    wrap.appendChild(valLabel);
    section.appendChild(wrap);
  }

  function buildText(section, facet) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "xrai-filter-input";
    input.placeholder = "Search...";
    input.value = facet.active || "";

    let debounce = null;
    input.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        filterEngine.setFilter(facet.name, input.value || null);
      }, 250);
    });

    section.appendChild(input);
  }

  function dispose() {
    if (panel) panel.remove();
    if (toggleBtn) toggleBtn.remove();
    panel = null;
    toggleBtn = null;
  }

  build();
  return { toggle, render, dispose };
}
