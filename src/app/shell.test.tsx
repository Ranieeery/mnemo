import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_KEYBOARD_SHORTCUTS, DEFAULT_SIDEBAR_PREFERENCES } from "../shared/ipc/bindings";
import { entryFixture, folderContentsFixture, videoFixture } from "../shared/test/fixtures";
import { callsOf, commandError } from "../shared/test/ipc";
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

    it("never opens the webview's own right-click menu, except in text fields", async () => {
        renderApp("/");
        const heading = await screen.findByRole("heading", { name: "Home", level: 1 });
        // `fireEvent` returns false when the default (the webview's menu) was prevented.
        expect(fireEvent.contextMenu(heading)).toBe(false);
        expect(fireEvent.contextMenu(screen.getByRole("searchbox"))).toBe(true);
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

describe("sidebar", () => {
    it("starts expanded and collapses to a rail that still navigates", async () => {
        const { user, calls } = renderApp("/");
        const toggle = await screen.findByRole("button", { name: "Collapse sidebar" });
        expect(toggle).toHaveAttribute("aria-expanded", "true");
        expect(toggle).toHaveAttribute("aria-controls", "sidebar");
        expect(screen.getByRole("separator", { name: "Resize sidebar" })).toHaveAttribute("aria-valuenow", "240");

        await user.click(toggle);
        // The same button, so the focus stays on it.
        expect(toggle).toHaveAccessibleName("Expand sidebar");
        expect(toggle).toHaveAttribute("aria-expanded", "false");
        expect(toggle).toHaveFocus();
        expect(screen.queryByRole("separator", { name: "Resize sidebar" })).not.toBeInTheDocument();
        await waitFor(() =>
            expect(callsOf(calls, "update_sidebar_preferences")).toEqual([
                { preferences: { ...DEFAULT_SIDEBAR_PREFERENCES, collapsed: true } },
            ])
        );

        // Icons only, with their names still available to tooltips and assistive technology.
        expect(screen.queryByText("Mnemo")).not.toBeInTheDocument();
        await openSeries(user);
        expect(screen.getByRole("link", { name: "Series" })).toHaveAttribute("aria-current", "page");
        await user.click(screen.getByRole("link", { name: "History" }));
        expect(await screen.findByRole("heading", { name: "History", level: 1 })).toBeInTheDocument();
    });

    it("opens the way it was left", async () => {
        renderApp("/", { get_sidebar_preferences: { collapsed: true, width: 320 } });
        expect(await screen.findByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
        expect(screen.getByRole("complementary", { name: "Sidebar" })).toHaveClass("w-14");
    });

    it("saves a new width once, after the edge stops moving", async () => {
        const { user, calls } = renderApp("/", { get_sidebar_preferences: { collapsed: false, width: 300 } });
        const edge = await screen.findByRole("separator", { name: "Resize sidebar" });
        const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
        expect(sidebar).toHaveStyle({ width: "300px" });

        edge.focus();
        await user.keyboard("{ArrowRight}{ArrowRight}");
        expect(sidebar).toHaveStyle({ width: "332px" });
        await waitFor(() =>
            expect(callsOf(calls, "update_sidebar_preferences")).toEqual([
                { preferences: { collapsed: false, width: 332 } },
            ])
        );

        await user.dblClick(edge);
        expect(sidebar).toHaveStyle({ width: `${DEFAULT_SIDEBAR_PREFERENCES.width}px` });
    });

    it("uses the defaults when the saved layout cannot be read", async () => {
        renderApp("/", {
            get_sidebar_preferences: () => {
                throw commandError("invalidInput", "unreadable");
            },
        });
        expect(await screen.findByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
        expect(await screen.findByText("Could not load the sidebar layout")).toBeInTheDocument();
    });
});

describe("long library folder names", () => {
    /** jsdom never resizes: records the observers so the test can report the sidebar getting narrower. */
    const observers: { callback: ResizeObserverCallback; observer: ResizeObserver }[] = [];
    class RecordingResizeObserver {
        constructor(callback: ResizeObserverCallback) {
            observers.push({ callback, observer: this });
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    }

    afterEach(() => {
        observers.length = 0;
        vi.unstubAllGlobals();
    });

    it("show the full name in a tooltip only while it is cut", async () => {
        vi.stubGlobal("ResizeObserver", RecordingResizeObserver);
        renderApp("/");
        const link = await screen.findByRole("link", { name: "Series" });
        const name = within(link).getByText("Series");
        expect(name).toHaveClass("line-clamp-2");
        expect(name).toHaveAttribute("title", "D:\\Series");

        act(() => link.focus());
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
        act(() => link.blur());

        // Narrower: the name needs more than its two lines.
        Object.defineProperty(name, "scrollHeight", { value: 60, configurable: true });
        Object.defineProperty(name, "clientHeight", { value: 40, configurable: true });
        act(() => {
            for (const { callback, observer } of observers) {
                callback([], observer);
            }
        });
        expect(name).not.toHaveAttribute("title");

        act(() => link.focus());
        const tooltip = await screen.findByRole("tooltip");
        expect(tooltip).toHaveTextContent("Series");
        expect(tooltip).toHaveTextContent("D:\\Series");
    });
});
