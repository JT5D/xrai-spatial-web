export function getUiHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Web Scraper</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 700px;
      margin: 0 auto;
      padding: 1.5rem 1rem;
      background: #0a0a0a;
      color: #e0e0e0;
      min-height: 100vh;
    }
    h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: #fff; }
    form { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
    input[type=url] {
      flex: 1;
      padding: 0.75rem 1rem;
      font-size: 1rem;
      border: 1px solid #333;
      border-radius: 8px;
      background: #1a1a1a;
      color: #fff;
      outline: none;
    }
    input[type=url]:focus { border-color: #4a9eff; }
    input[type=url]::placeholder { color: #666; }
    button {
      padding: 0.75rem 1.25rem;
      font-size: 1rem;
      border: none;
      border-radius: 8px;
      background: #4a9eff;
      color: #fff;
      cursor: pointer;
      font-weight: 600;
      white-space: nowrap;
    }
    button:hover { background: #3a8eef; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    #status {
      padding: 0.5rem 0;
      font-size: 0.9rem;
      color: #999;
      min-height: 2rem;
    }
    #status.error { color: #ff6b6b; }
    #status.success { color: #69db7c; }
    .result-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 1rem 0 0.5rem;
    }
    .result-header h2 { font-size: 1.1rem; color: #fff; }
    .stats { font-size: 0.85rem; color: #888; }
    .actions { display: flex; gap: 0.5rem; margin: 0.75rem 0; flex-wrap: wrap; }
    .actions button {
      padding: 0.5rem 1rem;
      font-size: 0.85rem;
      background: #222;
      border: 1px solid #333;
    }
    .actions button:hover { background: #333; }
    #result {
      background: #111;
      border: 1px solid #222;
      border-radius: 8px;
      padding: 1rem;
      white-space: pre-wrap;
      font-family: "SF Mono", "Fira Code", monospace;
      font-size: 0.85rem;
      line-height: 1.5;
      max-height: 60vh;
      overflow-y: auto;
      display: none;
    }
    @media (prefers-color-scheme: light) {
      body { background: #f5f5f5; color: #222; }
      h1, .result-header h2 { color: #000; }
      input[type=url] { background: #fff; border-color: #ccc; color: #000; }
      input[type=url]:focus { border-color: #4a9eff; }
      input[type=url]::placeholder { color: #999; }
      #status { color: #666; }
      #result { background: #fff; border-color: #ddd; }
      .actions button { background: #e8e8e8; border-color: #ccc; color: #222; }
    }
  </style>
</head>
<body>
  <h1>Web Scraper</h1>
  <form id="form">
    <input type="url" name="url" placeholder="https://example.com" required autofocus>
    <button type="submit" id="btn">Scrape</button>
  </form>
  <div id="status"></div>
  <div id="result-container" style="display:none">
    <div class="result-header">
      <h2 id="title"></h2>
    </div>
    <div class="stats" id="stats"></div>
    <div class="actions">
      <button onclick="copyMarkdown()">Copy Markdown</button>
      <button onclick="downloadFile('md')">Download .md</button>
      <button onclick="downloadFile('json')">Download .json</button>
    </div>
    <div id="result"></div>
  </div>

  <script>
    let lastData = null;

    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = new FormData(e.target).get('url');
      const btn = document.getElementById('btn');
      const status = document.getElementById('status');

      btn.disabled = true;
      btn.textContent = 'Scraping...';
      status.className = '';
      status.textContent = 'Fetching and processing...';

      try {
        const res = await fetch('/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || 'Scrape failed');
        }

        lastData = await res.json();

        status.className = 'success';
        status.textContent = 'Done!';

        document.getElementById('title').textContent = lastData.title;
        document.getElementById('stats').textContent =
          lastData.links.length + ' links, ' + lastData.images.length + ' images, ' +
          lastData.markdown.length + ' chars';
        document.getElementById('result').textContent = lastData.markdown;
        document.getElementById('result').style.display = 'block';
        document.getElementById('result-container').style.display = 'block';
      } catch (err) {
        status.className = 'error';
        status.textContent = 'Error: ' + err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Scrape';
      }
    });

    function copyMarkdown() {
      if (!lastData) return;
      navigator.clipboard.writeText(lastData.markdown).then(() => {
        document.getElementById('status').textContent = 'Copied to clipboard!';
        document.getElementById('status').className = 'success';
      });
    }

    function downloadFile(type) {
      if (!lastData) return;
      const safe = lastData.title.replace(/[^a-zA-Z0-9\\-_ ]/g, '').slice(0, 60).trim() || 'scraped';
      let content, mime;
      if (type === 'md') {
        content = '# ' + lastData.title + '\\n\\n' + lastData.markdown;
        mime = 'text/markdown';
      } else {
        content = JSON.stringify(lastData, null, 2);
        mime = 'application/json';
      }
      const blob = new Blob([content], { type: mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = safe + '.' + type;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  </script>
</body>
</html>`;
}
