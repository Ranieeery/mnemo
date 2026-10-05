import { describe, expect, it } from "vitest";
import { formatBytes } from "./formatBytes";

describe("formatBytes", () => {
    it.each([
        [0, "0 bytes"],
        [512, "512 bytes"],
        [1024, "1.0 KB"],
        [233_472, "228.0 KB"],
        [1_572_864, "1.5 MB"],
        [5 * 1024 ** 3, "5.0 GB"],
        [3 * 1024 ** 5, "3072.0 TB"],
        [Number.NaN, "0 bytes"],
    ])("formats %s", (bytes, text) => {
        expect(formatBytes(bytes)).toBe(text);
    });
});
