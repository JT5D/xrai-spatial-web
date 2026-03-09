import { load } from "cheerio";
import TurndownService from "turndown";

export async function scrape(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const html = await res.text();
  const $ = load(html);

  // Remove noise
  $(
    "script, style, nav, footer, header, iframe, noscript, [role=navigation], [role=banner]"
  ).remove();

  const title = $("title").text().trim() || "Untitled";
  const description =
    $('meta[name="description"]').attr("content")?.trim() || "";

  // Extract links
  const links = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();
    if (href && text && href.startsWith("http")) {
      links.push({ text, href });
    }
  });

  // Extract images
  const images = [];
  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    const alt = $(el).attr("alt")?.trim() || "";
    if (src) {
      images.push({ src, alt });
    }
  });

  // Get main content area or fall back to body
  const mainContent =
    $("main").html() ||
    $("article").html() ||
    $('[role="main"]').html() ||
    $("body").html() ||
    "";

  // Convert to markdown
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });
  const markdown = turndown.turndown(mainContent);

  return { title, description, url, links, images, markdown };
}
