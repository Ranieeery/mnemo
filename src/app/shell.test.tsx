import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DEFAULT_KEYBOARD_SHORTCUTS } from "../shared/ipc/bindings";
import { entryFixture, folderContentsFixture, videoFixture } from "../shared/test/fixtures";
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

    it("opens the watch history from the sidebar", async () => {
        const { user } = renderApp("/", {
            list_watch_history: { entries: [], nextCursor: null },
            get_watch_totals: [],
        });
        await user.click(await screen.findByRole("link", { name: "History" }));
        expect(await screen.findByRole("heading", { name: "History", level: 1 })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "History" })).toHaveAttribute("aria-current", "page");
    });

    it("shows every shortcut with ? and leads to their settings", async () => {
        const custom = { ...DEFAULT_KEYBOARD_SHORTCUTS, mute: ["N"] };
        const { user, router } = renderApp("/", { get_keyboard_shortcuts: custom });
        await screen.findByRole("heading", { name: "Home", level: 1 });

        await user.keyboard("?");
        const help = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
        const sound = within(help).getByRole("region", { name: "Sound and speed" });
        expect(within(sound).getByText("Mute").closest("div")).toHaveTextContent(/^MuteN/);
        expect(within(help).getByText("Leave full screen or close the player")).toBeInTheDocument();

        await user.click(within(help).getByRole("button", { name: "Customize in Settings" }));
        await waitFor(() => expect(router.state.location.search).toEqual({ tab: "shortcuts" }));
        expect(await screen.findByRole("tab", { name: "Shortcuts", selected: true })).toBeInTheDocument();
    });

    it("opens the help from the keyboard button but not while typing ?", async () => {
        const { user } = renderApp("/");
        const search = await screen.findByRole("searchbox", { name: "Search the library" });
        await user.type(search, "?");
        expect(search).toHaveValue("?");
        expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
        expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    });

    it("goes back with a reassigned key", async () => {
        const { user } = renderApp("/", {
            get_keyboard_shortcuts: { ...DEFAULT_KEYBOARD_SHORTCUTS, historyBack: ["Alt+Backspace"] },
        });
        await openSeries(user);
        await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
        expect(screen.getByRole("heading", { name: "Series", level: 1 })).toBeInTheDocument();
        await user.keyboard("{Alt>}{Backspace}{/Alt}");
        expect(await screen.findByRole("heading", { name: "Home", level: 1 })).toBeInTheDocument();
    });

    it("goes home from the logo", async () => {
        const { user } = renderApp("/");
        await openSeries(user);
        await user.click(screen.getByRole("link", { name: "Mnemo, go to home" }));
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

    it("keeps the folder's order in the URL without adding history entries", async () => {
        const pilot = videoFixture({ id: 1, title: "Pilot", filePath: "D:\\Series\\Pilot.mkv" });
        const { user, router } = renderApp("/", {
            browse_folder: folderContentsFixture({
                path: "D:\\Series",
                groups: [{ folderPath: "D:\\Series", relativePath: "", entries: [entryFixture(pilot)] }],
            }),
        });
        await openSeries(user);
        await user.click(await screen.findByRole("button", { name: "Show all videos" }));
        await user.click(await screen.findByRole("menuitemradio", { name: "Watched" }));
        await waitFor(() => expect(router.state.location.search).toEqual({ path: "D:\\Series", status: "watched" }));

        // Back leaves the folder instead of undoing the filter.
        await user.click(screen.getByRole("button", { name: "Back" }));
        expect(await screen.findByRole("heading", { name: "Home", level: 1 })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Forward" }));
        expect(await screen.findByRole("button", { name: "Show watched" })).toBeInTheDocument();
    });

    it("searches inside the folder being browsed", async () => {
        const { user } = renderApp("/");
        await openSeries(user);
        expect(screen.getByRole("searchbox", { name: "Search in Series" })).toBeInTheDocument();
    });
});
