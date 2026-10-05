import "./index.css";
import App from "./App";
import { mountApp } from "./app/mountApp";
import ErrorBoundary from "./components/ErrorBoundary/ErrorBoundary";
import { NavigationProvider } from "./contexts/NavigationContext";
import { VideoLibraryProvider } from "./contexts/VideoLibraryContext";

// Legacy entry point: mounts the new app shell with the legacy screens as its home route until phase 5.
function LegacyRoot() {
    return (
        <ErrorBoundary>
            <VideoLibraryProvider>
                <NavigationProvider>
                    <App />
                </NavigationProvider>
            </VideoLibraryProvider>
        </ErrorBoundary>
    );
}

mountApp(LegacyRoot);
