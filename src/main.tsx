import React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import ErrorBoundary from "./components/ErrorBoundary/ErrorBoundary";
import { VideoLibraryProvider } from "./contexts/VideoLibraryContext";
import { NavigationProvider } from "./contexts/NavigationContext";

const rootEl = document.getElementById("root") as HTMLElement;

ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
        <ErrorBoundary>
            <VideoLibraryProvider>
                <NavigationProvider>
                    <App />
                </NavigationProvider>
            </VideoLibraryProvider>
        </ErrorBoundary>
    </React.StrictMode>
);

const win = getCurrentWindow();
win.show().catch(() => {});
requestAnimationFrame(() => {
    const root = document.getElementById("root");
    if (root) root.style.opacity = "1";
});
