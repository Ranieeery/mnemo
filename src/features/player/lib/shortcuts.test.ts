import { describe, expect, it } from "vitest";
import { commandForKey, type PlayerCommand } from "./shortcuts";

function press(key: string, modifiers: Partial<Record<"altKey" | "ctrlKey" | "metaKey", boolean>> = {}) {
    return commandForKey({ key, altKey: false, ctrlKey: false, metaKey: false, ...modifiers });
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
        ["m", { type: "mute" }],
        ["c", { type: "subtitles" }],
        ["Escape", { type: "close" }],
    ])("maps %j", (key, command) => {
        expect(press(key)).toEqual(command);
    });

    it("leaves unrelated and modified keys alone", () => {
        expect(press("x")).toBeNull();
        expect(press("ArrowLeft", { altKey: true })).toBeNull();
        expect(press("f", { ctrlKey: true })).toBeNull();
        expect(press("k", { metaKey: true })).toBeNull();
    });
});
