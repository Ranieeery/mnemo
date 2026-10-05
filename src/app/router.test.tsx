import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createAppRouter } from "./router";

function Home() {
    return <h1>Legacy home</h1>;
}

function renderAt(path: string) {
    const router = createAppRouter(Home, createMemoryHistory({ initialEntries: [path] }));
    render(<RouterProvider router={router} />);
    return router;
}

describe("app router", () => {
    it("renders the home screen at the root", async () => {
        renderAt("/");
        expect(await screen.findByRole("heading", { name: "Legacy home" })).toBeInTheDocument();
    });

    it("serves the design system catalog in development", async () => {
        renderAt("/dev/catalog");
        expect(await screen.findByRole("heading", { name: "Foundations" })).toBeInTheDocument();
    });

    it("toggles the catalog with Ctrl+Shift+D", async () => {
        const user = userEvent.setup();
        const router = renderAt("/");
        await screen.findByRole("heading", { name: "Legacy home" });

        await user.keyboard("{Control>}{Shift>}d{/Shift}{/Control}");
        expect(await screen.findByRole("heading", { name: "Foundations" })).toBeInTheDocument();
        expect(router.state.location.pathname).toBe("/dev/catalog");

        await user.keyboard("{Control>}{Shift>}d{/Shift}{/Control}");
        expect(await screen.findByRole("heading", { name: "Legacy home" })).toBeInTheDocument();
    });
});
