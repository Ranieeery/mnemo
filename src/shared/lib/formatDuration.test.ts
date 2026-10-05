import { describe, expect, it } from "vitest";
import { formatDuration } from "./formatDuration";

describe("formatDuration", () => {
    it.each([
        [0, "0:00"],
        [5, "0:05"],
        [59.9, "0:59"],
        [60, "1:00"],
        [754, "12:34"],
        [3599, "59:59"],
        [3600, "1:00:00"],
        [3725, "1:02:05"],
        [36_000, "10:00:00"],
        [450_000, "125:00:00"],
    ])("formats %s seconds as %s", (seconds, expected) => {
        expect(formatDuration(seconds)).toBe(expected);
    });

    it.each([null, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY])("renders %s as 0:00", (value) => {
        expect(formatDuration(value)).toBe("0:00");
    });
});
