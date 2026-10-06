import { describe, expect, it } from "vitest";
import { DEFAULT_KEYBOARD_SHORTCUTS } from "../../../shared/ipc/bindings";
import { actionLabel, actionUsing, copyShortcuts, SHORTCUT_GROUPS, withKeys } from "./actions";

describe("shortcut actions", () => {
    it("names and groups every configurable action once", () => {
        const listed = SHORTCUT_GROUPS.flatMap((group) => group.actions.map(({ action }) => action));
        expect([...listed].sort()).toEqual(Object.keys(DEFAULT_KEYBOARD_SHORTCUTS).sort());
        expect(actionLabel("historyBack")).toBe("Go back");
    });

    it("finds the action that uses a key", () => {
        expect(actionUsing(DEFAULT_KEYBOARD_SHORTCUTS, "Space")).toBe("playPause");
        expect(actionUsing(DEFAULT_KEYBOARD_SHORTCUTS, "Alt+ArrowLeft")).toBe("historyBack");
        expect(actionUsing(DEFAULT_KEYBOARD_SHORTCUTS, "X")).toBeNull();
    });

    it("gives an action new keys, moving one away from another action", () => {
        const moved = withKeys(DEFAULT_KEYBOARD_SHORTCUTS, "theater", ["T", "F"], { action: "fullscreen", combo: "F" });
        expect(moved.theater).toEqual(["T", "F"]);
        expect(moved.fullscreen).toEqual([]);
        expect(moved.mute).toEqual(["M"]);
        // The defaults are left untouched.
        expect(DEFAULT_KEYBOARD_SHORTCUTS.fullscreen).toEqual(["F"]);
    });

    it("copies into lists the backend can take", () => {
        const copy = copyShortcuts(DEFAULT_KEYBOARD_SHORTCUTS);
        copy.mute.push("N");
        expect(DEFAULT_KEYBOARD_SHORTCUTS.mute).toEqual(["M"]);
    });
});
