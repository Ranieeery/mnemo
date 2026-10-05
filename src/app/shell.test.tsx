import { fireEvent, screen, waitFor } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { videoFixture } from "../shared/test/fixtures";
import { callsOf } from "../shared/test/ipc";
import { renderApp } from "./testApp";

async function openSeries(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("link", { name: "Series" }));
    expect(await screen.findByRole("heading", { name: "Series", level: 1 })).toBeInTheDocument();
}

describe("app shell", () => {
    it("navigates back and forward with the buttons and Alt+arrows", async () => {
        const { user } = renderApp("/");
        expect(await screen.findByRole("heading", { name: "Home", level: 1 })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();

        await openSeries(user);
        await user.click(screen.getByRole("button", { name: "Back" }));
        expect(await screen.findByRole("heading", { name: "Home", level: 1 })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Forward" })).toBeEnabled();

        await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
        expect(await screen.findByRole("heading", { name: "Series", level: 1 })).toBeInTheDocument();
        await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
        expect(await screen.findByRole("heading", { name: "Home", level: 1 })).toBeInTheDocument();
    });

    it("navigates with the mouse side buttons", async () => {
        const { user } = renderApp("/");
        await openSeries(user);

        fireEvent.mouseUp(window, { button: 3 });
        expect(await screen.findByRole("heading", { name: "Home", level: 1 })).toBeInTheDocument();
        fireEvent.mouseUp(window, { button: 4 });
        expect(await screen.findByRole("heading", { name: "Series", level: 1 })).toBeInTheDocument();
    });

    it("searches the library from the top bar and keeps the query in the URL", async () => {
        const { user, router, calls } = renderApp("/", { search_library: [videoFixture({ id: 1, title: "Pilot" })] });
        await user.type(await screen.findByRole("searchbox", { name: "Search the library" }), "pil");

        expect(await screen.findByRole("button", { name: "Pilot" })).toBeInTheDocument();
        expect(router.state.location.search).toEqual({ q: "pil" });
        expect(callsOf(calls, "search_library")).toEqual([{ query: "pil", limit: 300 }]);

        await user.keyboard("{Escape}");
        expect(await screen.findByRole("heading", { name: "Home", level: 1 })).toBeInTheDocument();
        await waitFor(() => expect(router.state.location.search).toEqual({}));
    });

    it("searches inside the folder being browsed", async () => {
        const { user } = renderApp("/");
        await openSeries(user);
        expect(screen.getByRole("searchbox", { name: "Search in Series" })).toBeInTheDocument();
    });
});
