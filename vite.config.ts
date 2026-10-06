/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
    plugins: [react(), tailwindcss()],

    // Keep Rust compiler errors visible in the terminal.
    clearScreen: false,
    build: {
        // The full icon set (~600 kB) is one lazy chunk, read from disk only when a picker or folder needs it.
        chunkSizeWarningLimit: 650,
        rolldownOptions: {
            output: {
                // Dependencies change less often than the app; keeping them apart keeps every chunk small.
                codeSplitting: {
                    groups: [
                        { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 2 },
                        // Icons stay out: the full lucide set loads on demand (FolderIcon's `loadAllIcons`), and the
                        // few icons used statically land next to the code that uses them.
                        {
                            name: "vendor",
                            test: /node_modules[\\/](?!lucide-react[\\/]dist[\\/]esm[\\/]icons[\\/])/,
                            priority: 1,
                        },
                    ],
                },
            },
        },
    },
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
        // Prebundled, lucide loads as one module instead of ~1900, which keeps the tests that load every icon fast.
        deps: { optimizer: { client: { enabled: true, include: ["lucide-react"] } } },
    },
});
