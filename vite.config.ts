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
        rolldownOptions: {
            output: {
                // Dependencies change less often than the app; keeping them apart keeps every chunk small.
                codeSplitting: {
                    groups: [
                        { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 2 },
                        { name: "vendor", test: /node_modules/, priority: 1 },
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
    },
});
