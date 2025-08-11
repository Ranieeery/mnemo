import React from "react";
import { getCurrentWindow } from '@tauri-apps/api/window';
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
function tryShow(attempt: number) {
    win.show().catch(() => {
        if (attempt < 3) setTimeout(() => tryShow(attempt + 1), 80 * (attempt + 1));
    });
}
requestAnimationFrame(() => {
    setTimeout(() => tryShow(0), 25);
    setTimeout(() => { win.isVisible().then(v => { if (!v) tryShow(0); }); }, 1000);
});
