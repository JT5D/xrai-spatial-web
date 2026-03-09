import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

export function saveOutput(data, outputDir = ".") {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const safeTitle =
    data.title
      .replace(/[^a-zA-Z0-9\-_ ]/g, "")
      .slice(0, 60)
      .trim() || "scraped";

  const mdPath = path.join(outputDir, `${safeTitle}.md`);
  const jsonPath = path.join(outputDir, `${safeTitle}.json`);

  const mdContent = `# ${data.title}\n\n> ${data.description}\n\n**Source:** ${data.url}\n**Scraped:** ${new Date().toISOString()}\n\n---\n\n${data.markdown}`;
  writeFileSync(mdPath, mdContent);

  const jsonContent = {
    title: data.title,
    description: data.description,
    url: data.url,
    scrapedAt: new Date().toISOString(),
    links: data.links,
    images: data.images,
    markdownLength: data.markdown.length,
    content: data.markdown,
  };
  writeFileSync(jsonPath, JSON.stringify(jsonContent, null, 2));

  return { mdPath, jsonPath };
}
