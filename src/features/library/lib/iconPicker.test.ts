import { describe, expect, it } from "vitest";
import { filterIconNames, iconLabel, MAIN_TAB_LIMIT, mainTabIcons } from "./iconPicker";

const suggested = Array.from({ length: 45 }, (_, index) => `icon-${index}`);

describe("mainTabIcons", () => {
    it("fills the tab with suggestions when nothing was used yet", () => {
        const tab = mainTabIcons([], suggested);
        expect(tab.recent).toEqual([]);
        expect(tab.suggested).toHaveLength(MAIN_TAB_LIMIT);
    });

    it("puts recent icons first without repeating them among the suggestions", () => {
        const tab = mainTabIcons(["zodiac-pisces", "icon-0"], suggested);
        expect(tab.recent).toEqual(["zodiac-pisces", "icon-0"]);
        expect(tab.suggested).not.toContain("icon-0");
        expect(tab.recent.length + tab.suggested.length).toBe(MAIN_TAB_LIMIT);
    });
});

describe("filterIconNames", () => {
    const names = ["film", "gamepad", "gamepad-2", "flame"];

    it("matches parts of names ignoring case, spaces and hyphens", () => {
        expect(filterIconNames(names, "GAME")).toEqual(["gamepad", "gamepad-2"]);
        expect(filterIconNames(names, "gamepad 2")).toEqual(["gamepad-2"]);
        expect(filterIconNames(names, "fl")).toEqual(["flame"]);
        expect(filterIconNames(names, "xyz")).toEqual([]);
    });

    it("keeps every name for an empty query", () => {
        expect(filterIconNames(names, "  ")).toEqual(names);
    });
});

describe("iconLabel", () => {
    it("spells the name in words", () => {
        expect(iconLabel("gamepad-2")).toBe("gamepad 2");
    });
});
