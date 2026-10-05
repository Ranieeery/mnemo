import "../shared/styles/index.css";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createAppRouter } from "./router";

/** Renders the app into `#root`. */
export function mountApp() {
    const container = document.getElementById("root");
    if (!container) {
        throw new Error("index.html must contain an element with id 'root'");
    }
    createRoot(container).render(
        <StrictMode>
            <RouterProvider router={createAppRouter()} />
        </StrictMode>
    );
}
