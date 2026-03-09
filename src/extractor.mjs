import { load } from "cheerio";
import TurndownService from "turndown";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// --- Individual extractors ---

function extractOpenGraph($) {
  const og = {};
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr("property").replace("og:", "");
    og[prop] = $(el).attr("content");
  });
  // Twitter cards as fallback
  $('meta[name^="twitter:"]').each((_, el) => {
    const prop = $(el).attr("name").replace("twitter:", "");
    if (!og[prop]) og[prop] = $(el).attr("content");
  });
  return Object.keys(og).length > 0 ? og : null;
}

function extractJsonLd($) {
  const blocks = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).html());
      if (parsed["@graph"]) {
        blocks.push(...parsed["@graph"]);
      } else if (Array.isArray(parsed)) {
        blocks.push(...parsed);
      } else {
        blocks.push(parsed);
      }
    } catch {
      /* skip malformed JSON-LD */
    }
  });
  return blocks;
}

function extractMeta($, url) {
  const base = new URL(url);
  return {
    title: $("title").text().trim() || "Untitled",
    description:
      $('meta[name="description"]').attr("content")?.trim() ||
      $('meta[property="og:description"]').attr("content")?.trim() ||
      "",
    author: $('meta[name="author"]').attr("content")?.trim() || null,
    keywords: ($('meta[name="keywords"]').attr("content") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    canonicalUrl:
      $('link[rel="canonical"]').attr("href") || url,
    favicon:
      $('link[rel="icon"]').attr("href") ||
      $('link[rel="shortcut icon"]').attr("href") ||
      `${base.origin}/favicon.ico`,
    language: $("html").attr("lang") || null,
    siteName:
      $('meta[property="og:site_name"]').attr("content")?.trim() ||
      base.hostname.replace(/^www\./, ""),
  };
}

function extractHeadings($) {
  const flat = [];
  const content = $("main, article, [role='main'], body").first();
  content.find("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const level = parseInt(el.tagName[1]);
    const text = $(el).text().trim();
    if (text && text.length < 200) {
      flat.push({ level, text, children: [] });
    }
  });

  // Build nested tree
  function buildTree(items) {
    const roots = [];
    const stack = [];
    for (const item of items) {
      while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
        stack.pop();
      }
      if (stack.length === 0) {
        roots.push(item);
      } else {
        stack[stack.length - 1].children.push(item);
      }
      stack.push(item);
    }
    return roots;
  }

  return buildTree(flat);
}

function extractBreadcrumbs($, jsonLd) {
  // Try JSON-LD BreadcrumbList first
  const crumbLd = jsonLd.find((d) => d["@type"] === "BreadcrumbList");
  if (crumbLd?.itemListElement) {
    return crumbLd.itemListElement
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map((item) => ({
        text: item.name || item.item?.name || "",
        href: item.item?.["@id"] || item.item || null,
      }));
  }

  // Fallback: look for nav with breadcrumb-like structure
  const nav = $('nav[aria-label*="breadcrumb"], nav.breadcrumb, .breadcrumbs, [itemtype*="BreadcrumbList"]');
  if (nav.length) {
    const crumbs = [];
    nav.find("a, span").each((_, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr("href") || null;
      if (text && text.length < 100) {
        crumbs.push({ text, href });
      }
    });
    if (crumbs.length > 0) return crumbs;
  }

  return [];
}

function extractLinks($, baseUrl) {
  const base = new URL(baseUrl);
  const internal = [];
  const external = {};
  const seen = new Set();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();
    if (!href || !text || text.length > 200) return;

    try {
      const resolved = new URL(href, baseUrl);
      if (!resolved.protocol.startsWith("http")) return;
      const key = resolved.href;
      if (seen.has(key)) return;
      seen.add(key);

      if (resolved.hostname === base.hostname) {
        internal.push({ text, href: resolved.href });
      } else {
        const domain = resolved.hostname.replace(/^www\./, "");
        if (!external[domain]) external[domain] = [];
        external[domain].push({ text, href: resolved.href });
      }
    } catch {
      /* skip invalid URLs */
    }
  });

  // RSS/Atom feeds
  const feeds = [];
  $('link[rel="alternate"][type*="rss"], link[rel="alternate"][type*="atom"]').each((_, el) => {
    feeds.push({
      type: $(el).attr("type"),
      href: $(el).attr("href"),
      title: $(el).attr("title") || "Feed",
    });
  });

  return { internal: internal.slice(0, 50), external, feeds };
}

function extractMedia($, baseUrl) {
  const ogImage = $('meta[property="og:image"]').attr("content");
  const images = [];
  const seen = new Set();

  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src || seen.has(src)) return;
    seen.add(src);
    try {
      const resolved = new URL(src, baseUrl).href;
      images.push({
        src: resolved,
        alt: $(el).attr("alt")?.trim() || "",
        width: parseInt($(el).attr("width")) || null,
        height: parseInt($(el).attr("height")) || null,
      });
    } catch {
      /* skip */
    }
  });

  // Mark hero image
  const heroSrc = ogImage || (images.length > 0 ? images[0].src : null);
  for (const img of images) {
    img.isHero = img.src === heroSrc;
  }

  // Videos (YouTube/Vimeo embeds + <video>)
  const videos = [];
  $("iframe[src]").each((_, el) => {
    const src = $(el).attr("src") || "";
    if (src.includes("youtube") || src.includes("youtu.be") || src.includes("vimeo")) {
      videos.push({ src, type: src.includes("vimeo") ? "vimeo" : "youtube" });
    }
  });
  $("video[src], video source[src]").each((_, el) => {
    videos.push({ src: $(el).attr("src"), type: "video" });
  });

  return {
    heroImage: heroSrc ? { src: heroSrc, alt: images.find((i) => i.isHero)?.alt || "" } : null,
    images: images.slice(0, 30),
    videos: videos.slice(0, 10),
  };
}

function deriveMeta(og, jsonLd, meta) {
  const article = jsonLd.find((d) =>
    ["Article", "NewsArticle", "BlogPosting", "WebPage", "Product", "Review"].includes(d["@type"])
  );

  const authorRaw = article?.author;
  let author =
    (typeof authorRaw === "string" ? authorRaw : null) ||
    authorRaw?.name ||
    (Array.isArray(authorRaw) ? authorRaw[0]?.name : null) ||
    meta.author;

  const ldKeywords = article?.keywords;
  const ldTags = ldKeywords
    ? Array.isArray(ldKeywords)
      ? ldKeywords
      : ldKeywords.split(",").map((s) => s.trim())
    : [];

  const allTags = [...ldTags, ...meta.keywords].filter(
    (v, i, a) => v && a.indexOf(v) === i
  );

  return {
    author: author || null,
    datePublished: article?.datePublished || og?.["article:published_time"] || null,
    dateModified: article?.dateModified || og?.["article:modified_time"] || null,
    section: article?.articleSection || og?.["article:section"] || null,
    tags: allTags,
    pageType: og?.type || article?.["@type"]?.toLowerCase() || "webpage",
  };
}

function extractMarkdown($) {
  // Clone and strip noise for markdown generation
  const $clone = load($.html());
  $clone(
    "script, style, nav, footer, header, iframe, noscript, [role=navigation], [role=banner]"
  ).remove();

  const mainContent =
    $clone("main").html() ||
    $clone("article").html() ||
    $clone('[role="main"]').html() ||
    $clone("body").html() ||
    "";

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });
  return turndown.turndown(mainContent);
}

// --- Graph builder ---

function buildGraph(data) {
  const nodes = [];
  const links = [];
  let nodeCount = 0;

  // Helper: add node with dedup
  function addNode(node) {
    if (nodeCount >= 100) return null; // cap total nodes
    nodes.push(node);
    nodeCount++;
    return node;
  }

  // 1. Center: the page
  addNode({
    id: "page",
    type: "page",
    label: data.title,
    ring: 0,
    data: {
      title: data.title,
      description: data.description,
      heroImage: data.media?.heroImage,
      url: data.url,
      siteName: data.siteName,
      pageType: data.pageType,
    },
  });

  // 2. Metadata nodes (ring 1)
  const metaFields = [
    ["Author", data.author],
    ["Published", data.datePublished],
    ["Section", data.section],
    ["Type", data.pageType],
  ];
  for (const [key, value] of metaFields) {
    if (!value) continue;
    const id = `meta:${key}`;
    if (addNode({ id, type: "meta", label: `${key}: ${value}`, ring: 1, data: { key, value } })) {
      links.push({ source: "page", target: id, type: "metadata" });
    }
  }

  // 3. Tags (ring 1)
  for (const tag of (data.tags || []).slice(0, 12)) {
    const id = `tag:${tag}`;
    if (addNode({ id, type: "tag", label: tag, ring: 1, data: { tag } })) {
      links.push({ source: "page", target: id, type: "tagged" });
    }
  }

  // 4. Breadcrumbs (ring 1, chain)
  let prevCrumb = "page";
  for (const [i, crumb] of (data.breadcrumbs || []).entries()) {
    const id = `crumb:${i}`;
    if (addNode({ id, type: "breadcrumb", label: crumb.text, ring: 1, data: crumb })) {
      links.push({ source: prevCrumb, target: id, type: "crumb" });
      prevCrumb = id;
    }
  }

  // 5. Headings (ring 2, tree — max 20)
  let headingCount = 0;
  function addHeadings(headings, parentId) {
    for (const h of headings) {
      if (headingCount >= 20) return;
      const id = `h:${headingCount}:${h.text.slice(0, 30)}`;
      headingCount++;
      if (
        addNode({
          id,
          type: "heading",
          label: h.text,
          ring: 2,
          data: { level: h.level, childCount: h.children.length },
        })
      ) {
        links.push({
          source: parentId,
          target: id,
          type: parentId === "page" ? "contains" : "child-of",
        });
        addHeadings(h.children, id);
      }
    }
  }
  addHeadings(data.headings || [], "page");

  // 6. Media (ring 2, max 8)
  const mediaItems = [...(data.media?.images || []).filter((i) => !i.isHero)].slice(0, 8);
  for (const [i, item] of mediaItems.entries()) {
    const id = `media:${i}`;
    if (addNode({ id, type: "media", label: item.alt || `Image ${i + 1}`, ring: 2, data: item })) {
      links.push({ source: "page", target: id, type: "contains" });
    }
  }

  // 7. External link groups (ring 3, max 20)
  const extDomains = Object.entries(data.links?.external || {})
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20);

  for (const [domain, domainLinks] of extDomains) {
    const id = `ext:${domain}`;
    if (
      addNode({
        id,
        type: "link-group",
        label: `${domain} (${domainLinks.length})`,
        ring: 3,
        data: { domain, count: domainLinks.length, links: domainLinks.slice(0, 5) },
      })
    ) {
      links.push({ source: "page", target: id, type: "links-to" });
    }
  }

  return { nodes, links };
}

// --- Main export ---

export async function extract(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

  const html = await res.text();
  const $ = load(html);

  const og = extractOpenGraph($);
  const jsonLd = extractJsonLd($);
  const meta = extractMeta($, url);
  const headings = extractHeadings($);
  const breadcrumbs = extractBreadcrumbs($, jsonLd);
  const pageLinks = extractLinks($, url);
  const media = extractMedia($, url);
  const derived = deriveMeta(og, jsonLd, meta);
  const markdown = extractMarkdown($);

  const result = {
    url,
    ...meta,
    og,
    jsonLd,
    ...derived,
    headings,
    breadcrumbs,
    links: pageLinks,
    media,
    markdown,
  };
  result.graph = buildGraph(result);
  return result;
}
