/**
 * Newspaper layout — hierarchical section-based view.
 *
 * Arranges content like a newspaper front page:
 * - Sections as vertical columns
 * - Headlines at top (largest text)
 * - Stories stacked by prominence within each section
 * - Author avatars, photos, and embedded media
 * - Faint connection lines between related stories across sections
 *
 * Works particularly well for news sites, documentation, and
 * any page with clear hierarchical structure.
 */
import { getTheme, parseColor } from "../../theme/tokens.mjs";

const SECTION_COLORS = [
  0x4fc3f7, 0xef5350, 0x66bb6a, 0xab47bc, 0xffca28,
  0xff7043, 0x26c6da, 0xec407a, 0x8d6e63, 0x78909c,
];

export function createNewspaperView() {
  let ctx = null;
  const group = new THREE.Group();
  group.name = "Newspaper";
  const meshes = [];

  return {
    name: "newspaper",
    label: "Newspaper",

    init(engineCtx) {
      ctx = engineCtx;
      ctx.scene.add(group);
    },

    async generate(graphData) {
      this.clear();
      if (!graphData?.nodes?.length) return;

      // Build hierarchy: page → sections → items
      const hierarchy = this._buildHierarchy(graphData);

      // Background panel
      const bgGeo = new THREE.PlaneGeometry(120, 80);
      const bgMat = new THREE.MeshStandardMaterial({
        color: 0x0d0d18,
        roughness: 0.95,
        side: THREE.DoubleSide,
      });
      const bg = new THREE.Mesh(bgGeo, bgMat);
      bg.position.set(0, 0, -2);
      group.add(bg);

      // Title bar at top
      const pageNode = graphData.nodes.find((n) => n.type === "page");
      if (pageNode) {
        this._buildMasthead(pageNode.label || "Untitled", 0, 35);
      }

      // Layout sections as columns
      const sectionCount = hierarchy.sections.length || 1;
      const colWidth = Math.min(25, 100 / sectionCount);
      const startX = -(sectionCount - 1) * colWidth / 2;

      hierarchy.sections.forEach((section, i) => {
        const x = startX + i * colWidth;
        this._buildSection(section, x, 28, colWidth - 2, i);
      });

      // Unsectioned items at bottom
      if (hierarchy.unsectioned.length > 0) {
        this._buildFooter(hierarchy.unsectioned, 0, -30);
      }

      // Cross-section connections
      this._buildConnections(graphData.links);

      // Animate
      this._animateEntrance();

      ctx.hooks.emit("view:generated", { name: "newspaper", nodeCount: graphData.nodes.length });
    },

    _buildHierarchy(graphData) {
      const sections = [];
      const sectionMap = new Map();
      const unsectioned = [];

      // Group headings as section headers
      const headings = graphData.nodes.filter((n) => n.type === "heading" && n.ring === 0);
      const subItems = graphData.nodes.filter((n) => n.type !== "heading" || n.ring > 0);

      // Create sections from top-level headings
      for (const h of headings) {
        const section = { heading: h, items: [] };
        sections.push(section);
        sectionMap.set(h.id, section);
      }

      // Assign items to sections via links or position
      const linkMap = new Map();
      for (const link of graphData.links) {
        const srcId = typeof link.source === "object" ? link.source.id : link.source;
        const tgtId = typeof link.target === "object" ? link.target.id : link.target;
        if (!linkMap.has(srcId)) linkMap.set(srcId, []);
        linkMap.get(srcId).push(tgtId);
        if (!linkMap.has(tgtId)) linkMap.set(tgtId, []);
        linkMap.get(tgtId).push(srcId);
      }

      for (const item of subItems) {
        const connected = linkMap.get(item.id) || [];
        let placed = false;
        for (const connId of connected) {
          if (sectionMap.has(connId)) {
            sectionMap.get(connId).items.push(item);
            placed = true;
            break;
          }
        }
        if (!placed) unsectioned.push(item);
      }

      // If no sections found, create one from all nodes
      if (sections.length === 0) {
        sections.push({
          heading: { id: "all", label: "Content", type: "heading" },
          items: graphData.nodes,
        });
      }

      return { sections, unsectioned };
    },

    _buildMasthead(title, x, y) {
      const canvas = document.createElement("canvas");
      const ctx2d = canvas.getContext("2d");
      canvas.width = 1024;
      canvas.height = 128;

      ctx2d.fillStyle = "#0d0d18";
      ctx2d.fillRect(0, 0, 1024, 128);

      // Thin rule
      ctx2d.strokeStyle = "#4fc3f7";
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      ctx2d.moveTo(50, 100);
      ctx2d.lineTo(974, 100);
      ctx2d.stroke();

      // Title
      ctx2d.fillStyle = "#ffffff";
      ctx2d.font = "bold 48px Georgia, serif";
      ctx2d.textAlign = "center";
      ctx2d.fillText(title.slice(0, 40), 512, 70);

      const tex = new THREE.CanvasTexture(canvas);
      const geo = new THREE.PlaneGeometry(60, 7.5);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, 0);
      group.add(mesh);
    },

    _buildSection(section, x, startY, width, colorIndex) {
      const color = SECTION_COLORS[colorIndex % SECTION_COLORS.length];
      let y = startY;

      // Section heading
      const headingMesh = this._buildSectionHeading(
        section.heading.label || "Section",
        x, y, width, color
      );
      group.add(headingMesh);
      meshes.push(headingMesh);
      headingMesh.userData = { nodeId: section.heading.id, nodeData: section.heading };
      y -= 5;

      // Items stacked below
      for (const item of section.items.slice(0, 8)) {
        const itemMesh = this._buildItem(item, x, y, width, color);
        if (itemMesh) {
          group.add(itemMesh);
          meshes.push(itemMesh);
          y -= (item.val || 1) * 1.5 + 2;
        }
      }

      // Vertical divider line
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x + width / 2 + 0.5, startY + 2, 0.1),
        new THREE.Vector3(x + width / 2 + 0.5, y - 2, 0.1),
      ]);
      const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.15 });
      group.add(new THREE.Line(lineGeo, lineMat));
    },

    _buildSectionHeading(text, x, y, width, color) {
      const canvas = document.createElement("canvas");
      const ctx2d = canvas.getContext("2d");
      canvas.width = 512;
      canvas.height = 64;

      ctx2d.fillStyle = "#0d0d18";
      ctx2d.fillRect(0, 0, 512, 64);

      ctx2d.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
      ctx2d.font = "bold 28px Georgia, serif";
      ctx2d.textAlign = "center";
      ctx2d.fillText(text.slice(0, 30), 256, 42);

      const tex = new THREE.CanvasTexture(canvas);
      const geo = new THREE.PlaneGeometry(width, 2.5);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, 0.1);
      return mesh;
    },

    _buildItem(node, x, y, width, sectionColor) {
      const h = Math.max(2, (node.val || 1) * 1.5);
      const canvas = document.createElement("canvas");
      const ctx2d = canvas.getContext("2d");
      canvas.width = 512;
      canvas.height = 256;

      // Card background
      ctx2d.fillStyle = "rgba(255,255,255,0.03)";
      ctx2d.fillRect(0, 0, 512, 256);

      // Left accent bar
      ctx2d.fillStyle = `#${sectionColor.toString(16).padStart(6, "0")}`;
      ctx2d.fillRect(0, 0, 4, 256);

      // Type badge
      ctx2d.font = "10px sans-serif";
      ctx2d.fillStyle = "#666";
      ctx2d.fillText(node.type?.toUpperCase() || "", 16, 20);

      // Label
      ctx2d.fillStyle = "#e0e0e0";
      ctx2d.font = "16px sans-serif";
      const label = node.label || node.id;
      const words = label.split(" ");
      let line = "";
      let ty = 48;
      for (const w of words) {
        const test = line + w + " ";
        if (ctx2d.measureText(test).width > 480 && line) {
          ctx2d.fillText(line.trim(), 16, ty);
          line = w + " ";
          ty += 20;
          if (ty > 200) break;
        } else {
          line = test;
        }
      }
      if (line && ty <= 200) ctx2d.fillText(line.trim(), 16, ty);

      const tex = new THREE.CanvasTexture(canvas);
      const geo = new THREE.PlaneGeometry(width * 0.9, h);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, 0.1);
      mesh.userData = { nodeId: node.id, nodeData: node };
      return mesh;
    },

    _buildFooter(nodes, x, y) {
      // Simple row of small items at bottom
      const count = Math.min(nodes.length, 10);
      const spacing = 100 / count;
      const startX = x - (count - 1) * spacing / 2;

      for (let i = 0; i < count; i++) {
        const node = nodes[i];
        const geo = new THREE.CircleGeometry(1.5, 16);
        const mat = new THREE.MeshStandardMaterial({
          color: SECTION_COLORS[i % SECTION_COLORS.length],
          transparent: true,
          opacity: 0.5,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(startX + i * spacing, y, 0.1);
        mesh.userData = { nodeId: node.id, nodeData: node };
        group.add(mesh);
        meshes.push(mesh);
      }
    },

    _buildConnections(links) {
      if (!links?.length) return;
      const posMap = new Map();
      for (const m of meshes) {
        if (m.userData?.nodeId) posMap.set(m.userData.nodeId, m.position.clone());
      }

      for (const link of links) {
        const srcId = typeof link.source === "object" ? link.source.id : link.source;
        const tgtId = typeof link.target === "object" ? link.target.id : link.target;
        const a = posMap.get(srcId);
        const b = posMap.get(tgtId);
        if (!a || !b) continue;

        // Curved connection
        const mid = new THREE.Vector3(
          (a.x + b.x) / 2,
          (a.y + b.y) / 2,
          Math.max(a.z, b.z) + 2
        );
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        const points = curve.getPoints(20);
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({
          color: 0x4444aa,
          transparent: true,
          opacity: 0.08,
        });
        group.add(new THREE.Line(geo, mat));
      }
    },

    _animateEntrance() {
      for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i];
        const targetX = mesh.position.x;
        mesh.position.x = targetX + (Math.random() - 0.5) * 20;
        mesh.material.opacity = 0;

        const delay = i * 40;
        const duration = 600;
        const start = performance.now() + delay;

        const animate = () => {
          const t = Math.min(1, (performance.now() - start) / duration);
          if (t < 0) { requestAnimationFrame(animate); return; }
          const ease = 1 - Math.pow(1 - t, 3);
          mesh.position.x = mesh.position.x + (targetX - mesh.position.x) * 0.1;
          mesh.material.opacity = Math.min(0.9, ease);
          if (t < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      }
    },

    update(delta, elapsed) {
      // Subtle parallax on sections based on time
    },

    getMeshes() {
      return meshes;
    },

    clear() {
      for (const mesh of meshes) {
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (mesh.material.map) mesh.material.map.dispose();
          mesh.material.dispose();
        }
      }
      meshes.length = 0;

      while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      }
    },

    dispose() {
      this.clear();
      if (ctx?.scene) ctx.scene.remove(group);
      ctx = null;
    },
  };
}
