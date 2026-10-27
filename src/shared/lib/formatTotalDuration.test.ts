import { describe, expect, it } from "vitest";
import { formatTotalDuration, hoursAndMinutes } from "./formatTotalDuration";

describe("hoursAndMinutes", () => {
    it("drops the hours below one hour and zero minutes on the hour", () => {
        expect(hoursAndMinutes(5)).toBe("5 min");
        expect(hoursAndMinutes(120)).toBe("2 h");
        expect(hoursAndMinutes(125)).toBe("2 h 5 min");
    });
});

describe("formatTotalDuration", () => {
    it("rounds to the nearest minute", () => {
        expect(formatTotalDuration(26 * 60 + 29)).toBe("26 min");
        expect(formatTotalDuration(26 * 60 + 30)).toBe("27 min");
        expect(formatTotalDuration(10 * 3600 + 42 * 60)).toBe("10 h 42 min");
        expect(formatTotalDuration(3600 - 20)).toBe("1 h");
    });

    it("says under a minute for very short or missing totals", () => {
        expect(formatTotalDuration(29)).toBe("Under a minute");
        expect(formatTotalDuration(0)).toBe("Under a minute");
        expect(formatTotalDuration(null)).toBe("Under a minute");
        expect(formatTotalDuration(undefined)).toBe("Under a minute");
        expect(formatTotalDuration(-60)).toBe("Under a minute");
        expect(formatTotalDuration(Number.NaN)).toBe("Under a minute");
    });
});
