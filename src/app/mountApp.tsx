import "../shared/styles/index.css";
import { type RouteComponent, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createAppRouter } from "./router";

/** Renders the app into `#root`, with `home` as the screen at "/". */
export function mountApp(home: RouteComponent) {
    const container = document.getElementById("root");
    if (!container) {
        throw new Error("index.html must contain an element with id 'root'");
    }
    createRoot(container).render(
        <StrictMode>
            <RouterProvider router={createAppRouter(home)} />
        </StrictMode>
    );
}
