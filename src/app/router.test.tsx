import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./testApp";

describe("app router", () => {
    it("opens the home screen at the root", async () => {
        renderApp("/");
        expect(await screen.findByRole("heading", { name: "Home", level: 1 })).toBeInTheDocument();
    });

    it("sends an empty player or folder route back home", async () => {
        const { router } = renderApp("/watch");
        expect(await screen.findByRole("heading", { name: "Home", level: 1 })).toBeInTheDocument();
        expect(router.state.location.pathname).toBe("/");
    });

    it("toggles the design system catalog with Ctrl+Shift+D in development", async () => {
        const { user, router } = renderApp("/");
        await screen.findByRole("heading", { name: "Home", level: 1 });

        await user.keyboard("{Control>}{Shift>}d{/Shift}{/Control}");
        expect(await screen.findByRole("heading", { name: "Foundations" })).toBeInTheDocument();
        expect(router.state.location.pathname).toBe("/dev/catalog");

        await user.keyboard("{Control>}{Shift>}d{/Shift}{/Control}");
        expect(await screen.findByRole("heading", { name: "Home", level: 1 })).toBeInTheDocument();
    });
});
