/**
 * MediaCity layout — "exploded view" of a webpage.
 *
 * Web page elements become physical 3D objects arranged like a small city:
 * - Photos/images → textured planes (largest = most important)
 * - Videos → textured planes with play button overlay
 * - Text/quotes → canvas-rendered text blocks
 * - Code blocks → canvas-rendered with monospace font
 * - Authors → circular avatar planes
 * - Links/logos → favicon-textured planes
 * - Headlines → large floating text (troika)
 *
 * Layout: bird's-eye grid, grouped by type as "districts".
 * Size encodes importance (val). Lines connect related items.
 */
import { getTheme, parseColor } from "../../theme/tokens.mjs";

const DISTRICT_COLORS = {
  heading:     0x4fc3f7,
  media:       0xef5350,
  "link-group": 0x66bb6a,
  meta:        0xab47bc,
  tag:         0xffca28,
  page:        0xffffff,
  default:     0x888888,
};

const DISTRICT_ORDER = ["page", "heading", "media", "link-group", "meta", "tag"];

export function createMediaCityView() {
  let ctx = null;
  const group = new THREE.Group();
  group.name = "MediaCity";
  const meshes = [];
  const textureCache = new Map();

  return {
    name: "media-city",
    label: "Media City",

    init(engineCtx) {
      ctx = engineCtx;
      ctx.scene.add(group);
    },

    async generate(graphData) {
      this.clear();
      if (!graphData?.nodes?.length) return;

      // Group nodes by type into districts
      const districts = new Map();
      for (const node of graphData.nodes) {
        const type = node.type || "default";
        if (!districts.has(type)) districts.set(type, []);
        districts.get(type).push(node);
      }

      // Sort districts by preferred order
      const orderedTypes = DISTRICT_ORDER.filter((t) => districts.has(t));
      for (const t of districts.keys()) {
        if (!orderedTypes.includes(t)) orderedTypes.push(t);
      }

      // Create ground plane
      const groundGeo = new THREE.PlaneGeometry(200, 200);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0x080810,
        roughness: 0.95,
        metalness: 0.05,
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      group.add(ground);

      // Grid overlay
      const gridHelper = new THREE.GridHelper(200, 40, 0x151520, 0x0c0c14);
      group.add(gridHelper);

      // Layout districts in a grid
      const districtSize = 40;
      const padding = 10;
      const cols = Math.ceil(Math.sqrt(orderedTypes.length));

      for (let i = 0; i < orderedTypes.length; i++) {
        const type = orderedTypes[i];
        const nodes = districts.get(type);
        const row = Math.floor(i / cols);
        const col = i % cols;
        const ox = (col - (cols - 1) / 2) * (districtSize + padding);
        const oz = (row - Math.floor(orderedTypes.length / cols) / 2) * (districtSize + padding);

        this._buildDistrict(type, nodes, ox, oz, districtSize, graphData.links);
      }

      // Build connection lines
      this._buildConnections(graphData.links, graphData.nodes);

      // Animate entrance
      this._animateEntrance();

      ctx.hooks.emit("view:generated", { name: "media-city", nodeCount: graphData.nodes.length });
    },

    _buildDistrict(type, nodes, ox, oz, size, links) {
      const color = DISTRICT_COLORS[type] || DISTRICT_COLORS.default;

      // District label
      if (typeof Text !== "undefined") {
        // Troika text (if available in global scope)
        const label = new Text();
        label.text = type.toUpperCase();
        label.fontSize = 1.5;
        label.color = color;
        label.anchorX = "center";
        label.position.set(ox, 0.5, oz - size / 2 - 2);
        label.rotation.x = -Math.PI / 2;
        label.sync();
        group.add(label);
      }

      // Arrange nodes within district
      const cols = Math.ceil(Math.sqrt(nodes.length));
      const cellSize = size / Math.max(cols, 1);

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x = ox + (col - (cols - 1) / 2) * cellSize;
        const z = oz + (row - Math.floor(nodes.length / cols) / 2) * cellSize;

        const item = this._buildItem(node, x, z, cellSize * 0.8, color);
        if (item) {
          group.add(item);
          meshes.push(item);
        }
      }
    },

    _buildItem(node, x, z, maxSize, districtColor) {
      const importance = Math.max(0.3, Math.min(1, (node.val || 1) / 5));
      const itemSize = maxSize * importance;

      // Determine what to render based on node content
      if (node.imageUrl || node.mediaKind === "image") {
        return this._buildImagePlane(node, x, z, itemSize);
      }
      if (node.videoUrl || node.mediaKind === "video") {
        return this._buildVideoPlane(node, x, z, itemSize);
      }
      if (node.code) {
        return this._buildCodeBlock(node, x, z, itemSize);
      }
      if (node.type === "heading" || node.text) {
        return this._buildTextBlock(node, x, z, itemSize, districtColor);
      }

      // Default: colored building-like box
      return this._buildDefaultBlock(node, x, z, itemSize, districtColor);
    },

    _buildImagePlane(node, x, z, size) {
      const geo = new THREE.PlaneGeometry(size, size * 0.75);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8,
        side: THREE.DoubleSide,
      });

      // Load texture if URL available
      if (node.imageUrl && typeof THREE.TextureLoader !== "undefined") {
        const loader = new THREE.TextureLoader();
        loader.crossOrigin = "anonymous";
        loader.load(
          node.imageUrl,
          (tex) => { mat.map = tex; mat.needsUpdate = true; },
          undefined,
          () => { mat.color.setHex(DISTRICT_COLORS.media); }
        );
      } else {
        mat.color.setHex(DISTRICT_COLORS.media);
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, size * 0.375 + 0.2, z);
      mesh.userData = { nodeId: node.id, nodeData: node };
      mesh.castShadow = true;
      return mesh;
    },

    _buildVideoPlane(node, x, z, size) {
      const geo = new THREE.PlaneGeometry(size, size * 0.5625); // 16:9
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1a1a2e,
        roughness: 0.5,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, size * 0.28 + 0.2, z);
      mesh.userData = { nodeId: node.id, nodeData: node, isVideo: true };
      mesh.castShadow = true;

      // Play button triangle overlay
      const triGeo = new THREE.ConeGeometry(size * 0.08, size * 0.12, 3);
      const triMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const tri = new THREE.Mesh(triGeo, triMat);
      tri.rotation.z = -Math.PI / 2;
      tri.position.set(x, size * 0.28 + 0.2, z + size * 0.3);
      group.add(tri);

      return mesh;
    },

    _buildTextBlock(node, x, z, size, color) {
      // Canvas-rendered text as texture
      const canvas = document.createElement("canvas");
      const ctx2d = canvas.getContext("2d");
      const res = 256;
      canvas.width = res;
      canvas.height = res;

      // Background
      ctx2d.fillStyle = "#0a0a14";
      ctx2d.fillRect(0, 0, res, res);

      // Text
      const text = node.label || node.text || node.id;
      ctx2d.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
      ctx2d.font = "bold 20px sans-serif";
      ctx2d.textAlign = "center";

      // Word wrap
      const words = text.split(" ");
      let line = "";
      let y = 40;
      for (const word of words) {
        const test = line + word + " ";
        if (ctx2d.measureText(test).width > res - 20 && line) {
          ctx2d.fillText(line.trim(), res / 2, y);
          line = word + " ";
          y += 24;
          if (y > res - 20) break;
        } else {
          line = test;
        }
      }
      if (line && y <= res - 20) ctx2d.fillText(line.trim(), res / 2, y);

      const tex = new THREE.CanvasTexture(canvas);
      const geo = new THREE.PlaneGeometry(size, size);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.9,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, size * 0.5 + 0.2, z);
      mesh.userData = { nodeId: node.id, nodeData: node };
      mesh.castShadow = true;
      return mesh;
    },

    _buildCodeBlock(node, x, z, size) {
      const canvas = document.createElement("canvas");
      const ctx2d = canvas.getContext("2d");
      const res = 256;
      canvas.width = res;
      canvas.height = res;

      // Dark code background
      ctx2d.fillStyle = "#1e1e2e";
      ctx2d.fillRect(0, 0, res, res);

      // Code text
      ctx2d.fillStyle = "#a6e3a1";
      ctx2d.font = "12px monospace";
      const lines = (node.code || "// code").split("\n").slice(0, 12);
      lines.forEach((line, i) => {
        ctx2d.fillText(line.slice(0, 35), 8, 18 + i * 16);
      });

      const tex = new THREE.CanvasTexture(canvas);
      const geo = new THREE.BoxGeometry(size, size * 0.8, size * 0.1);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, size * 0.4 + 0.2, z);
      mesh.userData = { nodeId: node.id, nodeData: node };
      mesh.castShadow = true;
      return mesh;
    },

    _buildDefaultBlock(node, x, z, size, color) {
      const height = 2 + (node.val || 1) * 3;
      const geo = new THREE.BoxGeometry(size * 0.6, height, size * 0.6);
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.15,
        roughness: 0.7,
        metalness: 0.2,
        transparent: true,
        opacity: 0.85,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, height / 2 + 0.1, z);
      mesh.userData = { nodeId: node.id, nodeData: node };
      mesh.castShadow = true;
      return mesh;
    },

    _buildConnections(links, nodes) {
      if (!links?.length) return;

      const nodePositions = new Map();
      for (const m of meshes) {
        if (m.userData?.nodeId) {
          nodePositions.set(m.userData.nodeId, m.position.clone());
        }
      }

      for (const link of links) {
        const srcId = typeof link.source === "object" ? link.source.id : link.source;
        const tgtId = typeof link.target === "object" ? link.target.id : link.target;
        const srcPos = nodePositions.get(srcId);
        const tgtPos = nodePositions.get(tgtId);
        if (!srcPos || !tgtPos) continue;

        const points = [srcPos, tgtPos];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({
          color: 0x4444aa,
          transparent: true,
          opacity: 0.12,
        });
        const line = new THREE.Line(geo, mat);
        group.add(line);
      }
    },

    _animateEntrance() {
      // Staggered rise from below
      for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i];
        const targetY = mesh.position.y;
        mesh.position.y = -5;
        mesh.material.opacity = 0;

        const delay = i * 30;
        const duration = 800;
        const start = performance.now() + delay;

        const animate = () => {
          const t = Math.min(1, (performance.now() - start) / duration);
          if (t < 0) { requestAnimationFrame(animate); return; }
          const ease = 1 - Math.pow(1 - t, 3);
          mesh.position.y = -5 + (targetY + 5) * ease;
          if (mesh.material.opacity !== undefined) {
            mesh.material.opacity = Math.min(mesh.material.opacity + 0.02, 0.85);
          }
          if (t < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      }
    },

    update(delta, elapsed) {
      // Gentle floating animation
      for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i];
        if (mesh.userData?.nodeData) {
          mesh.position.y += Math.sin(elapsed * 0.5 + i * 0.3) * 0.001;
        }
      }
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

      for (const tex of textureCache.values()) tex.dispose();
      textureCache.clear();
    },

    dispose() {
      this.clear();
      if (ctx?.scene) ctx.scene.remove(group);
      ctx = null;
    },
  };
}
