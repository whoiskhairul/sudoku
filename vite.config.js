import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { attachRoomRelay } from "./roomRelay.js";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "sudoku-room-relay",
      configureServer(server) {
        if (server.httpServer) {
          attachRoomRelay(server.httpServer, {
            path: "/room-ws",
            log: (message) => server.config.logger.info(message),
          });
        }
      },
    },
  ],
  server: {
    host: "0.0.0.0",
  },
  preview: {
    host: "0.0.0.0",
  },
});
