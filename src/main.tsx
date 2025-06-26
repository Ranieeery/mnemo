import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import ErrorBoundary from "./components/ErrorBoundary/ErrorBoundary";
import { VideoLibraryProvider } from "./contexts/VideoLibraryContext";
import { NavigationProvider } from "./contexts/NavigationContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <ErrorBoundary>
            <VideoLibraryProvider>
                <NavigationProvider>
                    <App/>
                </NavigationProvider>
            </VideoLibraryProvider>
        </ErrorBoundary>
    </React.StrictMode>,
);
