/**
 * XRAI Format serialization — save/load/share documents.
 */

import { validate, XRAI_VERSION } from "./schema.mjs";

/** Serialize XRAI document to JSON string */
export function serialize(doc) {
  doc.updatedAt = new Date().toISOString();
  return JSON.stringify(doc, null, 2);
}

/** Deserialize JSON string to XRAI document */
export function deserialize(json) {
  const doc = typeof json === "string" ? JSON.parse(json) : json;

  // Version migration
  if (!doc.version || doc.version !== XRAI_VERSION) {
    return migrate(doc);
  }

  const { valid, errors } = validate(doc);
  if (!valid) {
    throw new Error(`Invalid XRAI document: ${errors.join(", ")}`);
  }

  return doc;
}

/** Migrate older format versions */
function migrate(doc) {
  // Currently only v1.0 exists, but this handles pre-format data
  if (!doc.version) {
    // Legacy extract() output → XRAI document
    return {
      version: XRAI_VERSION,
      createdAt: doc.extractedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: {
        url: doc.url || doc.source?.url || "",
        title: doc.title || doc.source?.title || "",
        extractedAt: doc.extractedAt || new Date().toISOString(),
        extractorVersion: "0.9",
      },
      graph: {
        nodes: doc.graph?.nodes || doc.nodes || [],
        links: doc.graph?.links || doc.links || [],
      },
      viewState: { mode: "force-graph", camera: { x: 0, y: 0, z: 80 }, filters: {}, highlights: [] },
      userLayer: { annotations: [], ratings: [], customLayouts: [] },
      provenance: { contributors: [], aiModels: [], metrics: { views: 0, shares: 0, forks: 0 } },
      theme: null,
    };
  }
  return doc;
}

/** Create a shareable URL-safe encoded document (compressed) */
export function toShareURL(doc, baseUrl) {
  const compact = {
    v: doc.version,
    s: doc.source.url,
    m: doc.viewState.mode,
    f: Object.keys(doc.viewState.filters).length > 0 ? doc.viewState.filters : undefined,
  };
  const encoded = btoa(JSON.stringify(compact));
  return `${baseUrl}/spatial?xrai=${encodeURIComponent(encoded)}`;
}

/** Decode a share URL back to minimal state */
export function fromShareURL(url) {
  const u = new URL(url);
  const xrai = u.searchParams.get("xrai");
  if (!xrai) return null;
  return JSON.parse(atob(decodeURIComponent(xrai)));
}
