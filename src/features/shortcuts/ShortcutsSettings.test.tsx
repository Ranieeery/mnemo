import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_KEYBOARD_SHORTCUTS, type KeyboardShortcuts } from "../../shared/ipc/bindings";
import { callsOf, commandError, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { ShortcutsSettings } from "./components/ShortcutsSettings";
import { copyShortcuts } from "./lib/actions";

function isShortcuts(value: unknown): value is KeyboardShortcuts {
    return typeof value === "object" && value !== null && "playPause" in value;
}

function renderShortcuts({ fails = false }: { fails?: boolean } = {}) {
    let stored: KeyboardShortcuts = copyShortcuts(DEFAULT_KEYBOARD_SHORTCUTS);
    const calls = mockCommands({
        get_keyboard_shortcuts: () => stored,
        update_keyboard_shortcuts: ({ shortcuts }: Record<string, unknown>) => {
            if (fails) {
                throw commandError("invalidInput", "P is already used by mute");
            }
            if (isShortcuts(shortcuts)) {
                stored = shortcuts;
            }
            return stored;
        },
    });
    return {
        calls,
        saved: () => callsOf(calls, "update_keyboard_shortcuts").at(-1)?.shortcuts,
        ...renderScreen(<ShortcutsSettings />),
    };
}

/** The row of an action, found by its name. */
async function row(label: string) {
    const name = await screen.findByText(label, { selector: "span" });
    const item = name.closest("li");
    if (!item) {
        throw new Error(`no row for ${label}`);
    }
    return within(item);
}

describe("ShortcutsSettings", () => {
    it("records a new key for an action", async () => {
        const { user, saved } = renderShortcuts();
        const mute = await row("Mute");
        await user.click(mute.getByRole("button", { name: "Add a key for Mute" }));
        expect(mute.getByRole("button", { name: /Press the new key for Mute/ })).toHaveFocus();
        await user.keyboard("n");

        expect(await screen.findByText("Shortcut saved")).toBeInTheDocument();
        expect(saved()).toMatchObject({ mute: ["M", "N"] });
        expect(mute.getByRole("button", { name: "Remove N from Mute" })).toBeInTheDocument();
        // Two keys is the most an action can have.
        expect(mute.queryByRole("button", { name: "Add a key for Mute" })).not.toBeInTheDocument();
    });

    it("cancels recording with Escape and refuses reserved keys", async () => {
        const { user, calls } = renderShortcuts();
        const theater = await row("Theater mode");
        await user.click(theater.getByRole("button", { name: "Add a key for Theater mode" }));
        await user.keyboard("{Escape}");
        expect(theater.queryByRole("button", { name: /Press the new key/ })).not.toBeInTheDocument();

        await user.click(theater.getByRole("button", { name: "Add a key for Theater mode" }));
        await user.keyboard("?");
        expect(theater.getByRole("alert")).toHaveTextContent("? is reserved and can't be used.");
        expect(callsOf(calls, "update_keyboard_shortcuts")).toEqual([]);
    });

    it("explains a key another action uses and can move it here", async () => {
        const { user, saved } = renderShortcuts();
        const theater = await row("Theater mode");
        await user.click(theater.getByRole("button", { name: "Add a key for Theater mode" }));
        await user.keyboard("f");

        const problem = theater.getByRole("alert");
        expect(problem).toHaveTextContent("F is already used by Full screen.");
        await user.click(within(problem).getByRole("button", { name: "Use here instead" }));

        await waitFor(() => expect(saved()).toMatchObject({ theater: ["T", "F"], fullscreen: [] }));
        expect((await row("Full screen")).getByText("Not set")).toBeInTheDocument();
    });

    it("removes a key and resets an action to its defaults", async () => {
        const { user, saved } = renderShortcuts();
        const playPause = await row("Play or pause");
        await user.click(playPause.getByRole("button", { name: "Remove K from Play or pause" }));
        await waitFor(() => expect(saved()).toMatchObject({ playPause: ["Space"] }));

        await user.click(playPause.getByRole("button", { name: "Reset Play or pause to its default keys" }));
        await waitFor(() => expect(saved()).toMatchObject({ playPause: ["Space", "K"] }));
        expect(playPause.queryByRole("button", { name: /Reset Play or pause/ })).not.toBeInTheDocument();
    });

    it("restores every default after confirmation", async () => {
        const { user, saved } = renderShortcuts();
        const mute = await row("Mute");
        await user.click(mute.getByRole("button", { name: "Remove M from Mute" }));
        await waitFor(() => expect(saved()).toMatchObject({ mute: [] }));

        await user.click(screen.getByRole("button", { name: "Restore all defaults" }));
        const dialog = await screen.findByRole("alertdialog", { name: "Restore all default shortcuts?" });
        await user.click(within(dialog).getByRole("button", { name: "Restore defaults" }));
        await waitFor(() => expect(saved()).toEqual(DEFAULT_KEYBOARD_SHORTCUTS));
        expect(await screen.findByText("Restored the default shortcuts")).toBeInTheDocument();
    });

    it("goes back to the saved keys when saving fails", async () => {
        const { user } = renderShortcuts({ fails: true });
        const mute = await row("Mute");
        await user.click(mute.getByRole("button", { name: "Remove M from Mute" }));

        expect(await screen.findByText("Could not save the shortcut")).toBeInTheDocument();
        expect(screen.getByText("P is already used by mute")).toBeInTheDocument();
        expect(mute.getByRole("button", { name: "Remove M from Mute" })).toBeInTheDocument();
    });
});
