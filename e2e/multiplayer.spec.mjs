import { test, expect } from "@playwright/test";

test.describe("Multiplayer Rooms", () => {
  test("GET /rooms returns room list", async ({ request }) => {
    const res = await request.get("/rooms");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test("two users can join the same room via WebSocket", async ({ browser }) => {
    const wsPageHTML = (userId) => `
      <div id="status">connecting</div>
      <div id="peers">0</div>
      <div id="messages"></div>
      <script>
        const ws = new WebSocket('ws://localhost:3210/rooms');
        ws.onopen = () => {
          document.getElementById('status').textContent = 'connected';
          ws.send(JSON.stringify({
            type: 'join',
            room: 'test-room-e2e',
            userId: '${userId}',
            displayName: 'User ${userId}',
          }));
        };
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          const el = document.getElementById('messages');
          el.textContent += msg.type + ';';
          if (msg.type === 'room_state' || msg.type === 'peer_joined') {
            const peers = msg.peers ? msg.peers.length : (parseInt(document.getElementById('peers').textContent) + 1);
            document.getElementById('peers').textContent = String(peers);
          }
        };
        ws.onerror = () => { document.getElementById('status').textContent = 'error'; };
        ws.onclose = () => { document.getElementById('status').textContent = 'closed'; };
      </script>
    `;

    // Create two browser contexts (simulating two users)
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    try {
      // User 1 joins
      await page1.setContent(wsPageHTML("user-1"));
      await expect(page1.locator("#status")).toHaveText("connected", { timeout: 5_000 });

      // User 2 joins same room
      await page2.setContent(wsPageHTML("user-2"));
      await expect(page2.locator("#status")).toHaveText("connected", { timeout: 5_000 });

      // Wait for peer discovery
      await page1.waitForTimeout(2_000);

      // Both should have received room messages
      const msgs1 = await page1.locator("#messages").textContent();
      const msgs2 = await page2.locator("#messages").textContent();
      expect(msgs1.length).toBeGreaterThan(0);
      expect(msgs2.length).toBeGreaterThan(0);
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  });

  test("stress test: 10 concurrent users in one room", async ({ browser }) => {
    const NUM_USERS = 10;
    const contexts = [];
    const pages = [];

    try {
      // Create all users
      for (let i = 0; i < NUM_USERS; i++) {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        contexts.push(ctx);
        pages.push(page);

        await page.setContent(`
          <div id="status">connecting</div>
          <div id="msg-count">0</div>
          <script>
            let msgCount = 0;
            const ws = new WebSocket('ws://localhost:3210/rooms');
            ws.onopen = () => {
              document.getElementById('status').textContent = 'connected';
              ws.send(JSON.stringify({
                type: 'join',
                room: 'stress-test-room',
                userId: 'stress-user-${i}',
                displayName: 'Stress ${i}',
              }));
            };
            ws.onmessage = () => {
              msgCount++;
              document.getElementById('msg-count').textContent = String(msgCount);
            };
            ws.onerror = () => { document.getElementById('status').textContent = 'error'; };
          </script>
        `);
      }

      // Wait for all to connect
      for (const page of pages) {
        await expect(page.locator("#status")).toHaveText("connected", { timeout: 10_000 });
      }

      // Verify all received messages (room_state at minimum)
      await pages[0].waitForTimeout(3_000);
      for (const page of pages) {
        const count = parseInt(await page.locator("#msg-count").textContent());
        expect(count).toBeGreaterThan(0);
      }
    } finally {
      for (const ctx of contexts) {
        await ctx.close();
      }
    }
  });
});
