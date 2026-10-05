/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
    plugins: [react(), tailwindcss()],

    // Keep Rust compiler errors visible in the terminal.
    clearScreen: false,
    server: {
        // Tauri expects a fixed port and fails if it is taken.
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
        watch: {
            ignored: ["**/src-tauri/**"],
        },
    },

    test: {
        include: ["src/**/*.test.{ts,tsx}"],
        environment: "jsdom",
        setupFiles: ["src/shared/test/setup.ts"],
    },
});
