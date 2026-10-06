import { describe, expect, it } from "vitest";
import { DEFAULT_KEYBOARD_SHORTCUTS } from "../../../shared/ipc/bindings";
import type { ShortcutKeys } from "../../../shared/lib/keyboard";
import { commandForKey, type PlayerCommand } from "./shortcuts";

function press(
    key: string,
    modifiers: Partial<Record<"altKey" | "ctrlKey" | "metaKey" | "shiftKey", boolean>> = {},
    shortcuts: ShortcutKeys = DEFAULT_KEYBOARD_SHORTCUTS
) {
    return commandForKey(
        { key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...modifiers },
        shortcuts
    );
}

describe("commandForKey", () => {
    it.each<[string, PlayerCommand]>([
        [" ", { type: "togglePlay" }],
        ["k", { type: "togglePlay" }],
        ["K", { type: "togglePlay" }],
        ["j", { type: "seek", by: -10 }],
        ["l", { type: "seek", by: 10 }],
        ["ArrowLeft", { type: "seek", by: -5 }],
        ["ArrowRight", { type: "seek", by: 5 }],
        ["ArrowUp", { type: "volume", by: 0.05 }],
        ["ArrowDown", { type: "volume", by: -0.05 }],
        ["[", { type: "speed", by: -0.25 }],
        ["]", { type: "speed", by: 0.25 }],
        ["Backspace", { type: "resetSpeed" }],
        ["f", { type: "fullscreen" }],
        ["t", { type: "theater" }],
        ["m", { type: "mute" }],
        ["c", { type: "subtitles" }],
        ["Escape", { type: "close" }],
    ])("maps %j", (key, command) => {
        expect(press(key)).toEqual(command);
    });

    it("leaves unrelated and modified keys alone", () => {
        expect(press("x")).toBeNull();
        // Alt+arrows belong to the app's history navigation.
        expect(press("ArrowLeft", { altKey: true })).toBeNull();
        expect(press("f", { ctrlKey: true })).toBeNull();
        expect(press("k", { metaKey: true })).toBeNull();
    });

    it("follows the configured keys", () => {
        const custom = { ...DEFAULT_KEYBOARD_SHORTCUTS, playPause: ["P"], mute: ["Ctrl+M"] };
        expect(press("p", {}, custom)).toEqual({ type: "togglePlay" });
        expect(press("k", {}, custom)).toBeNull();
        expect(press("m", { ctrlKey: true }, custom)).toEqual({ type: "mute" });
        expect(press("m", {}, custom)).toBeNull();
    });

    it("always closes with Escape, whatever is configured", () => {
        expect(press("Escape", {}, { ...DEFAULT_KEYBOARD_SHORTCUTS, playPause: [] })).toEqual({ type: "close" });
    });
});
