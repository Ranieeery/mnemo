import { describe, expect, it } from "vitest";
import { comboFromEvent, comboLabel, comboParts, hasCommandModifier, isReservedCombo, isTextEntry } from "./keyboard";

function press(key: string, modifiers: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) {
    return comboFromEvent({ key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...modifiers });
}

describe("comboFromEvent", () => {
    it("names keys the way the backend stores them", () => {
        expect(press(" ")).toBe("Space");
        expect(press("k")).toBe("K");
        expect(press("K", { shiftKey: true })).toBe("K");
        expect(press("[")).toBe("[");
        expect(press("+")).toBe("Plus");
        expect(press("ArrowLeft")).toBe("ArrowLeft");
        expect(press("F5")).toBe("F5");
    });

    it("adds modifiers in a fixed order", () => {
        expect(press("ArrowLeft", { altKey: true })).toBe("Alt+ArrowLeft");
        expect(press("s", { metaKey: true, ctrlKey: true, altKey: true })).toBe("Ctrl+Alt+Meta+S");
    });

    it("keeps Shift for named keys only, since characters already include it", () => {
        expect(press("?", { shiftKey: true })).toBe("?");
        expect(press("ArrowLeft", { shiftKey: true })).toBe("Shift+ArrowLeft");
        expect(press("Tab", { shiftKey: true })).toBe("Shift+Tab");
    });

    it("ignores presses that cannot be shortcuts", () => {
        for (const key of ["Shift", "Control", "Alt", "Meta", "Dead", "Unidentified", "MediaPlayPause", "CapsLock"]) {
            expect(press(key)).toBeNull();
        }
        expect(
            comboFromEvent({
                key: "a",
                ctrlKey: false,
                altKey: false,
                shiftKey: false,
                metaKey: false,
                isComposing: true,
            })
        ).toBeNull();
    });
});

describe("comboParts and comboLabel", () => {
    it("show keys as people read them", () => {
        expect(comboParts("Alt+ArrowLeft")).toEqual(["Alt", "←"]);
        expect(comboParts("Plus")).toEqual(["+"]);
        expect(comboLabel("Ctrl+Shift+ArrowUp")).toBe("Ctrl+Shift+↑");
        expect(comboLabel("Space")).toBe("Space");
    });
});

describe("isReservedCombo", () => {
    it("knows the keys no action can take", () => {
        expect(isReservedCombo("Escape")).toBe(true);
        expect(isReservedCombo("?")).toBe(true);
        expect(isReservedCombo("Shift+Tab")).toBe(true);
        expect(isReservedCombo("K")).toBe(false);
    });
});

describe("typing guards", () => {
    it("tells text fields apart from other elements", () => {
        expect(isTextEntry(document.createElement("input"))).toBe(true);
        expect(isTextEntry(document.createElement("textarea"))).toBe(true);
        expect(isTextEntry(document.createElement("button"))).toBe(false);
        expect(isTextEntry(null)).toBe(false);
    });

    it("knows which combinations cannot be typing", () => {
        expect(hasCommandModifier("Alt+ArrowLeft")).toBe(true);
        expect(hasCommandModifier("Shift+Meta+K")).toBe(true);
        expect(hasCommandModifier("Shift+ArrowLeft")).toBe(false);
        expect(hasCommandModifier("K")).toBe(false);
    });
});
