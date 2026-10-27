import { describe, expect, it } from "vitest";
import { formatRemaining } from "./formatRemaining";

describe("formatRemaining", () => {
    it("rounds minutes up", () => {
        expect(formatRemaining(14 * 60, 6 * 60 + 30)).toBe("8 min left");
        expect(formatRemaining(600, 539)).toBe("2 min left");
        expect(formatRemaining(600, 540)).toBe("1 min left");
    });

    it("says under a minute for the last seconds and for a finished video", () => {
        expect(formatRemaining(600, 541)).toBe("Under a minute left");
        expect(formatRemaining(600, 600)).toBe("Under a minute left");
        expect(formatRemaining(600, 900)).toBe("Under a minute left");
    });

    it("adds hours from one hour up, dropping zero minutes", () => {
        expect(formatRemaining(2 * 3600, 0)).toBe("2 h left");
        expect(formatRemaining(3900, 0)).toBe("1 h 5 min left");
        expect(formatRemaining(3600 + 1, 0)).toBe("1 h 1 min left");
    });

    it("treats invalid values as nothing watched", () => {
        expect(formatRemaining(300, Number.NaN)).toBe("5 min left");
        expect(formatRemaining(300, -10)).toBe("5 min left");
        expect(formatRemaining(Number.POSITIVE_INFINITY, 0)).toBe("Under a minute left");
        expect(formatRemaining(-5, 0)).toBe("Under a minute left");
    });
});
