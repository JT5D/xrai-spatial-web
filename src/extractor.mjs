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

function youtubeThumb(src) {
  const m = src.match(/(?:embed\/|v=|youtu\.be\/)([\w-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
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
      const isVimeo = src.includes("vimeo");
      const thumb = isVimeo ? null : youtubeThumb(src);
      videos.push({ src, type: isVimeo ? "vimeo" : "youtube", thumbnail: thumb });
    }
  });
  $("video[src], video source[src]").each((_, el) => {
    const poster = $(el).closest("video").attr("poster") || null;
    videos.push({ src: $(el).attr("src"), type: "video", thumbnail: poster });
  });

  return {
    heroImage: heroSrc ? { src: heroSrc, alt: images.find((i) => i.isHero)?.alt || "" } : null,
    images: images.slice(0, 30),
    videos: videos.slice(0, 10),
  };
}

function extractCodeBlocks($) {
  const blocks = [];
  $("pre code, code[class*='language-'], .highlight pre").each((_, el) => {
    const text = $(el).text().trim();
    if (text.length < 10 || text.length > 2000) return;
    const classAttr = $(el).attr("class") || "";
    const langMatch = classAttr.match(/language-(\w+)/);
    blocks.push({
      code: text.slice(0, 500),
      language: langMatch?.[1] || null,
    });
  });
  return blocks.slice(0, 8);
}

function extractBlockquotes($) {
  const quotes = [];
  $("blockquote").each((_, el) => {
    const text = $(el).text().trim();
    if (text.length < 10 || text.length > 500) return;
    const cite = $(el).find("cite, footer").text().trim() || null;
    quotes.push({ text: text.replace(cite || "", "").trim(), cite });
  });
  return quotes.slice(0, 6);
}

function extractTables($) {
  const tables = [];
  $("table").each((_, el) => {
    const headers = [];
    $(el).find("thead th, tr:first-child th").each((_, th) => {
      headers.push($(th).text().trim());
    });
    const rows = [];
    $(el).find("tbody tr, tr").slice(headers.length ? 0 : 1).each((_, tr) => {
      const cells = [];
      $(tr).find("td, th").each((_, td) => {
        cells.push($(td).text().trim());
      });
      if (cells.length > 0) rows.push(cells);
    });
    if (rows.length > 0) {
      tables.push({ headers, rows: rows.slice(0, 20), rowCount: rows.length });
    }
  });
  return tables.slice(0, 4);
}

function extractAudio($, baseUrl) {
  const items = [];
  $("audio[src], audio source[src]").each((_, el) => {
    try {
      const src = new URL($(el).attr("src"), baseUrl).href;
      items.push({ src, type: $(el).attr("type") || "audio" });
    } catch { /* skip */ }
  });
  // Podcast embeds (Spotify, Apple Podcasts)
  $("iframe[src]").each((_, el) => {
    const src = $(el).attr("src") || "";
    if (src.includes("spotify.com/embed") || src.includes("podcasts.apple.com")) {
      items.push({ src, type: src.includes("spotify") ? "spotify" : "apple-podcast" });
    }
  });
  return items.slice(0, 6);
}

function extractLede($) {
  const content = $("main, article, [role='main'], body").first();
  const first = content.find("p").first().text().trim();
  return first && first.length > 20 ? first.slice(0, 300) : null;
}

function estimateReadingTime($) {
  const content = $("main, article, [role='main'], body").first();
  const text = content.text();
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 250));
}

function deriveMeta(og, jsonLd, meta) {
  const article = jsonLd.find((d) =>
    ["Article", "NewsArticle", "BlogPosting", "WebPage", "Product", "Review"].includes(d["@type"])
  );

  const authorRaw = article?.author;
  const authorObj = Array.isArray(authorRaw) ? authorRaw[0] : authorRaw;
  let author =
    (typeof authorRaw === "string" ? authorRaw : null) ||
    authorObj?.name ||
    meta.author;

  // Author avatar from JSON-LD Person
  let authorAvatar = null;
  if (typeof authorObj === "object") {
    authorAvatar = authorObj?.image?.url || authorObj?.image || null;
  }

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
    authorAvatar,
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
    val: 5,
    section: data.section || null,
    author: data.author || null,
    imageUrl: data.media?.heroImage?.src || null,
    url: data.url,
    text: data.description || "",
    data: {
      title: data.title,
      description: data.description,
      heroImage: data.media?.heroImage,
      url: data.url,
      siteName: data.siteName,
      pageType: data.pageType,
      lede: data.lede || null,
      readingTimeMin: data.readingTimeMin || null,
      authorAvatar: data.authorAvatar || null,
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
          ring: parentId === "page" ? 0 : 2,
          val: Math.max(1, 5 - h.level),
          text: h.text,
          section: data.section || null,
          author: data.author || null,
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

  // 6. Images (ring 2, max 12)
  const imageItems = (data.media?.images || []).filter((i) => !i.isHero).slice(0, 12);
  for (const [i, item] of imageItems.entries()) {
    const id = `img:${i}`;
    if (addNode({
      id, type: "media", label: item.alt || `Image ${i + 1}`, ring: 2,
      val: item.isHero ? 4 : 2,
      mediaKind: "image",
      imageUrl: item.src,
      data: item,
    })) {
      links.push({ source: "page", target: id, type: "contains" });
    }
  }

  // 6b. Videos (ring 2, max 6)
  const videoItems = (data.media?.videos || []).slice(0, 6);
  for (const [i, item] of videoItems.entries()) {
    const id = `vid:${i}`;
    if (addNode({
      id, type: "media", label: `Video: ${item.type}`, ring: 2,
      val: 3,
      mediaKind: "video",
      videoUrl: item.src,
      data: item,
    })) {
      links.push({ source: "page", target: id, type: "contains" });
    }
  }

  // 7. Code blocks (ring 2)
  for (const [i, block] of (data.codeBlocks || []).entries()) {
    const id = `code:${i}`;
    if (addNode({
      id, type: "media", label: `Code${block.language ? ` (${block.language})` : ""}`,
      ring: 2, val: 2,
      mediaKind: "code",
      code: block.code,
      data: block,
    })) {
      links.push({ source: "page", target: id, type: "contains" });
    }
  }

  // 7b. Blockquotes (ring 2, max 4)
  for (const [i, quote] of (data.blockquotes || []).slice(0, 4).entries()) {
    const id = `quote:${i}`;
    if (addNode({
      id, type: "media", label: quote.text.slice(0, 60), ring: 2, val: 2,
      mediaKind: "quote",
      text: quote.text,
      data: quote,
    })) {
      links.push({ source: "page", target: id, type: "contains" });
    }
  }

  // 7c. Tables (ring 2, max 3)
  for (const [i, table] of (data.tables || []).slice(0, 3).entries()) {
    const id = `table:${i}`;
    const label = table.headers.length > 0
      ? `Table: ${table.headers.slice(0, 3).join(", ")}`
      : `Table (${table.rowCount} rows)`;
    if (addNode({
      id, type: "media", label, ring: 2, val: 2,
      mediaKind: "table",
      data: table,
    })) {
      links.push({ source: "page", target: id, type: "contains" });
    }
  }

  // 7d. Audio (ring 2, max 4)
  for (const [i, item] of (data.audio || []).slice(0, 4).entries()) {
    const id = `audio:${i}`;
    if (addNode({
      id, type: "media", label: `Audio: ${item.type}`, ring: 2, val: 2,
      mediaKind: "audio",
      audioUrl: item.src,
      data: item,
    })) {
      links.push({ source: "page", target: id, type: "contains" });
    }
  }

  // 8. External link groups (ring 3, max 20)
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

/** @internal — exported for testing */
export { buildGraph as _buildGraph };

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
  const codeBlocks = extractCodeBlocks($);
  const blockquotes = extractBlockquotes($);
  const tables = extractTables($);
  const audio = extractAudio($, url);
  const lede = extractLede($);
  const readingTimeMin = estimateReadingTime($);
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
    codeBlocks,
    blockquotes,
    tables,
    audio,
    lede,
    readingTimeMin,
    markdown,
  };
  result.graph = buildGraph(result);
  return result;
}
