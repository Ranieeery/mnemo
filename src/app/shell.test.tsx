import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_KEYBOARD_SHORTCUTS, DEFAULT_SIDEBAR_PREFERENCES } from "../shared/ipc/bindings";
import { entryFixture, folderContentsFixture, videoFixture } from "../shared/test/fixtures";
import { callsOf, commandError } from "../shared/test/ipc";
import { setWindowWidth } from "../shared/test/window";
import { normalWindow, renderApp } from "./testApp";

async function openSeries(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("link", { name: "Series" }));
    expect(await screen.findByRole("heading", { name: "Series", level: 1 })).toBeInTheDocument();
}

describe("app shell", () => {
    it("navigates back and forward with the buttons and Alt+arrows", async () => {
        const { user } = renderApp("/");
        expect(await screen.findByRole("heading", { name: "Home", level: 1 })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Back" })).toHaveAttribute("aria-disabled", "true");

        await openSeries(user);
        await user.click(screen.getByRole("button", { name: "Back" }));
        expect(await screen.findByRole("heading", { name: "Home", level: 1 })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Forward" })).toBeEnabled();

        await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
        expect(await screen.findByRole("heading", { name: "Series", level: 1 })).toBeInTheDocument();
        await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
        expect(await screen.findByRole("heading", { name: "Home", level: 1 })).toBeInTheDocument();
    });

    it("offers to skip to the screen with the first Tab", async () => {
        const { user } = renderApp("/");
        const heading = await screen.findByRole("heading", { name: "Home", level: 1 });
        await user.tab();
        expect(screen.getByRole("button", { name: "Skip to content" })).toHaveFocus();
        await user.keyboard("{Enter}");
        expect(heading).toHaveFocus();
    });

    it("moves focus to the new screen's title, unless it is in the sidebar", async () => {
        const { user } = renderApp("/");
        await openSeries(user);
        // Opened from the sidebar: focus stays on the folder (F2 renames it).
        expect(screen.getByRole("link", { name: "Series" })).toHaveFocus();

        // Focus lost with the screen left behind (like a clicked card) goes to the new screen's title.
        screen.getByRole("link", { name: "Series" }).blur();
        await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
        await waitFor(() => expect(screen.getByRole("heading", { name: "Home", level: 1 })).toHaveFocus());
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
        expect(within(help).getByText("Leave full screen or the mini player, or close the player")).toBeInTheDocument();
        const windowKeys = within(help).getByRole("region", { name: "Window" });
        expect(within(windowKeys).getByText("Mini player").closest("div")).toHaveTextContent(/^Mini playerI/);
        expect(within(windowKeys).getByText("Pin window")).toBeInTheDocument();

        // The first Esc closes it (no tooltip opened on the close button to take it).
        await user.keyboard("{Escape}");
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        await user.keyboard("?");
        const reopened = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });

        await user.click(within(reopened).getByRole("button", { name: "Customize in Settings" }));
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
        const { user, router } = renderApp("/", {
            get_keyboard_shortcuts: { ...DEFAULT_KEYBOARD_SHORTCUTS, historyBack: ["Alt+Backspace"] },
        });
        await openSeries(user);
        // The keys move the (memory) history at once; the screen follows later.
        await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
        expect(router.history.location.pathname).toBe("/folder");
        await user.keyboard("{Alt>}{Backspace}{/Alt}");
        expect(router.history.location.pathname).toBe("/");
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

    it("searches inside the folder being browsed, keeping its order and filter", async () => {
        const pilot = videoFixture({ id: 1, title: "Pilot", filePath: "D:\\Series\\Pilot.mkv" });
        const { user, router } = renderApp("/", {
            search_folder: [],
            browse_folder: folderContentsFixture({
                path: "D:\\Series",
                groups: [{ folderPath: "D:\\Series", relativePath: "", entries: [entryFixture(pilot)] }],
            }),
        });
        await openSeries(user);
        await user.click(await screen.findByRole("button", { name: "Show all videos" }));
        await user.click(await screen.findByRole("menuitemradio", { name: "Watched" }));
        await waitFor(() => expect(router.state.location.search).toEqual({ path: "D:\\Series", status: "watched" }));

        await user.type(screen.getByRole("searchbox", { name: "Search in Series" }), "pil");
        await waitFor(() =>
            expect(router.state.location.search).toEqual({ path: "D:\\Series", status: "watched", q: "pil" })
        );
    });

    it("drops a search typed on a screen left before it runs", async () => {
        const { user, router, calls } = renderApp("/", {
            search_library: [],
            list_watch_history: { entries: [], nextCursor: null },
            get_watch_totals: [],
        });
        const search = await screen.findByRole("searchbox", { name: "Search the library" });
        await user.type(search, "pil");
        await user.click(screen.getByRole("link", { name: "History" }));
        expect(await screen.findByRole("heading", { name: "History", level: 1 })).toBeInTheDocument();

        await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
        expect(router.state.location.pathname).toBe("/history");
        expect(screen.getByRole("searchbox", { name: "Search the library" })).toHaveValue("");
        expect(callsOf(calls, "search_library")).toEqual([]);
    });

    it("stays on the screen under an open dialog with Alt+← or the mouse side buttons", async () => {
        const { user, router } = renderApp("/");
        await openSeries(user);
        await user.keyboard("?");
        const help = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });

        await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
        fireEvent.mouseUp(window, { button: 3 });
        expect(router.history.location.pathname).toBe("/folder");
        expect(help).toBeInTheDocument();

        await user.click(within(help).getByText("Close", { selector: "button" }));
        await waitFor(() => expect(help).not.toBeInTheDocument());
        await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
        expect(await screen.findByRole("heading", { name: "Home", level: 1 })).toBeInTheDocument();
    });
});

describe("locating a folder that is not connected", () => {
    it("moves the screen to the folder's new location", async () => {
        const calls = { relocated: 0 };
        const { user, router } = renderApp("/", {
            get_library_folder_statuses: [{ path: "D:\\Series", watch: "unavailable", reason: null }],
            browse_folder: ({ path }: { path: string }) => {
                if (path.startsWith("D:")) {
                    // The screen follows the folder's status; a permanent kind just skips the query's retry.
                    throw commandError("notFound", "D:\\Series");
                }
                return folderContentsFixture({ path });
            },
            "plugin:dialog|open": "E:\\Series",
            check_folder_relocation: ({ to }: { to: string }) => ({
                from: "D:\\Series",
                to,
                totalVideos: 2,
                foundVideos: 2,
                differentVideos: 0,
                quality: "complete",
            }),
            relocate_library_folder: ({ to }: { to: string }) => {
                calls.relocated++;
                return {
                    folder: { id: 1, path: to, name: "Series", customIcon: null, iconColor: null, createdAt: null },
                    totalVideos: 2,
                    foundVideos: 2,
                };
            },
        });
        await user.click(await screen.findByRole("link", { name: "Series, not connected" }));
        expect(await screen.findByRole("heading", { name: "This folder is not connected" })).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Locate folder…" }));
        const dialog = await screen.findByRole("dialog", { name: "Locate Series" });
        await user.click(await within(dialog).findByRole("button", { name: "Use this folder" }));

        expect(await screen.findByText("Located Series")).toBeInTheDocument();
        await waitFor(() => expect(router.state.location.search).toEqual({ path: "E:\\Series" }));
        expect(calls.relocated).toBe(1);
        expect(screen.queryByRole("dialog", { name: "Locate Series" })).not.toBeInTheDocument();
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

    it("is a rail in a narrow window, opening over the screen without changing the saved layout", async () => {
        setWindowWidth(800);
        const { user, calls } = renderApp("/", { get_sidebar_preferences: { collapsed: false, width: 280 } });
        const toggle = await screen.findByRole("button", { name: "Expand sidebar" });
        const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
        expect(sidebar).toHaveClass("w-14");
        expect(document.querySelector("main")?.closest("[inert]")).toBeNull();

        await user.click(toggle);
        expect(toggle).toHaveAccessibleName("Collapse sidebar");
        expect(toggle).toHaveAttribute("aria-expanded", "true");
        expect(sidebar).toHaveStyle({ width: "280px" });
        // The screen under the drawer is out of reach until it closes.
        expect(document.querySelector("main")?.closest("[inert]")).not.toBeNull();

        await user.keyboard("{Escape}");
        expect(toggle).toHaveAccessibleName("Expand sidebar");
        expect(toggle).toHaveFocus();
        expect(document.querySelector("main")?.closest("[inert]")).toBeNull();

        // Going to another screen closes it too.
        await user.click(toggle);
        await user.click(screen.getByRole("link", { name: "History" }));
        expect(await screen.findByRole("heading", { name: "History", level: 1 })).toBeInTheDocument();
        expect(toggle).toHaveAccessibleName("Expand sidebar");

        expect(callsOf(calls, "update_sidebar_preferences")).toEqual([]);
    });

    it("goes back to the saved layout when the window widens", async () => {
        setWindowWidth(800);
        const { user } = renderApp("/", { get_sidebar_preferences: { collapsed: false, width: 280 } });
        await user.click(await screen.findByRole("button", { name: "Expand sidebar" }));

        act(() => setWindowWidth(1280));
        expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
        expect(document.querySelector("main")?.closest("[inert]")).toBeNull();

        // Narrowing again shows the rail, not the drawer left open before.
        act(() => setWindowWidth(800));
        expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
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

describe("pin window", () => {
    /** The app with a key for "Pin window", which has none by default. */
    function renderWithPinKey(extraCommands: Record<string, unknown> = {}) {
        return renderApp("/", {
            get_keyboard_shortcuts: { ...DEFAULT_KEYBOARD_SHORTCUTS, pinWindow: ["P"] },
            ...extraCommands,
        });
    }

    it("starts unpinned, and its key keeps the window on top on every screen until pressed again", async () => {
        const { user, calls } = renderWithPinKey();
        await screen.findByRole("heading", { name: "Home", level: 1 });
        await waitFor(() => expect(callsOf(calls, "get_window_mode")).toHaveLength(1));
        // The top bar has no pin button: it lives in the player, and its key works everywhere.
        expect(screen.queryByRole("button", { name: "Pin window" })).not.toBeInTheDocument();

        await user.keyboard("p");
        expect(
            await screen.findByText("Window pinned on top", { selector: "[role=status] > span" })
        ).toBeInTheDocument();
        expect(callsOf(calls, "set_window_pinned")).toEqual([{ pinned: true }]);

        // The pin survives moving around the app.
        await openSeries(user);
        await user.keyboard("p");
        expect(await screen.findByText("Window unpinned", { selector: "[role=status] > span" })).toBeInTheDocument();
        expect(callsOf(calls, "set_window_pinned")).toEqual([{ pinned: true }, { pinned: false }]);
    });

    it("goes back to unpinned and says why when the system refuses", async () => {
        const { user, calls } = renderWithPinKey({
            set_window_pinned: () => {
                throw commandError("internal", "the window manager said no");
            },
        });
        await screen.findByRole("heading", { name: "Home", level: 1 });
        await user.keyboard("p");

        expect(await screen.findByText("Could not pin the window")).toBeInTheDocument();
        expect(screen.getByText("the window manager said no")).toBeInTheDocument();
        // Still unpinned: the next press tries to pin again.
        await user.keyboard("p");
        await waitFor(() => expect(callsOf(calls, "set_window_pinned")).toEqual([{ pinned: true }, { pinned: true }]));
    });

    it("ignores its key while typing", async () => {
        const { user, calls } = renderWithPinKey();
        const search = await screen.findByRole("searchbox", { name: "Search the library" });
        await user.type(search, "p");
        expect(search).toHaveValue("p");
        expect(callsOf(calls, "set_window_pinned")).toEqual([]);
    });

    it("does nothing where windows cannot stay on top", async () => {
        const { user, calls } = renderWithPinKey({ get_window_mode: { ...normalWindow, onTopSupported: false } });
        await screen.findByRole("heading", { name: "Home", level: 1 });
        await waitFor(() => expect(callsOf(calls, "get_window_mode")).toHaveLength(1));
        await user.keyboard("p");
        expect(callsOf(calls, "set_window_pinned")).toEqual([]);
    });
});

describe("mini player outside the player", () => {
    it("ends as soon as the app is not showing a video", async () => {
        const { calls } = renderApp("/", {
            get_window_mode: { ...normalWindow, mini: true },
            exit_mini_player: normalWindow,
        });
        await waitFor(() => expect(callsOf(calls, "exit_mini_player")).toHaveLength(1));
        expect(await screen.findByText("Mini player off", { selector: "[role=status] > span" })).toBeInTheDocument();
    });
});
