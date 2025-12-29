// Extension Hot Reload Server - Auto-reloads extension via WebSocket
import { watch } from "fs";

const EXTENSION_DIR = "./extension";
const WS_PORT = 35729;
const DEBOUNCE_MS = 300;

let lastChange = 0;
const clients = new Set<any>();

console.log("\n🔥 Extension Hot Reload Server");
console.log("━".repeat(40));

// Start WebSocket server
const server = Bun.serve({
  port: WS_PORT,
  fetch(req, server) {
    if (server.upgrade(req)) {
      return;
    }
    return new Response("Extension Hot Reload Server", { status: 200 });
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      console.log(`🔌 Extension connected (${clients.size} client${clients.size > 1 ? 's' : ''})`);
    },
    close(ws) {
      clients.delete(ws);
      console.log(`📴 Extension disconnected (${clients.size} client${clients.size > 1 ? 's' : ''})`);
    },
    message(ws, message) {
      // Handle ping/pong for keepalive
      if (message === "ping") {
        ws.send("pong");
      }
    },
  },
});

console.log(`📡 WebSocket server: ws://localhost:${WS_PORT}`);
console.log(`📁 Watching: ${EXTENSION_DIR}`);
console.log("\n⏳ Waiting for extension to connect...\n");

// Broadcast reload signal to all connected extensions
function broadcastReload(filename: string) {
  const time = new Date().toLocaleTimeString("th-TH");
  console.log(`\n⚡ [${time}] ${filename} changed`);

  if (clients.size === 0) {
    console.log("   ⚠️  No extension connected - reload manually once");
    return;
  }

  console.log(`   🔄 Reloading ${clients.size} extension${clients.size > 1 ? 's' : ''}...`);

  for (const client of clients) {
    try {
      client.send(JSON.stringify({ type: "reload", file: filename }));
    } catch (e) {
      clients.delete(client);
    }
  }
}

// Watch for file changes
watch(EXTENSION_DIR, { recursive: true }, (eventType, filename) => {
  if (!filename) return;

  // Ignore hidden files, temp files, and the hot-reload script itself
  if (filename.startsWith(".") || filename.endsWith("~") || filename.endsWith(".tmp")) return;

  const now = Date.now();

  // Debounce rapid changes
  if (now - lastChange < DEBOUNCE_MS) return;
  lastChange = now;

  broadcastReload(filename);
});

// Handle shutdown
process.on("SIGINT", () => {
  console.log("\n\n👋 Hot reload server stopped\n");
  server.stop();
  process.exit(0);
});

console.log("✅ Ready! Extension will auto-reload on file changes\n");
