import { describe, expect, it } from "vitest";
import { videoFixture } from "../test/fixtures";
import { entryTitle, toEntry, watchedFraction } from "./entry";

describe("entryTitle", () => {
    it("prefers the library title and falls back to the file name without extension", () => {
        const video = videoFixture({ title: "Pilot" });
        expect(entryTitle({ path: "x", name: "S01E01.mkv", video })).toBe("Pilot");
        expect(entryTitle({ path: "x", name: "S01E01.final.mkv", video: null })).toBe("S01E01.final");
    });
});

describe("toEntry", () => {
    it("derives the file name from the path", () => {
        const video = videoFixture({ filePath: "D:\\Videos\\Show\\Ep 1.mkv" });
        expect(toEntry(video)).toEqual({ path: "D:\\Videos\\Show\\Ep 1.mkv", name: "Ep 1.mkv", video });
    });
});

describe("watchedFraction", () => {
    it("is the share of the duration watched, capped at 1", () => {
        expect(watchedFraction(videoFixture({ durationSeconds: 200, watchProgressSeconds: 50 }))).toBe(0.25);
        expect(watchedFraction(videoFixture({ durationSeconds: 200, watchProgressSeconds: 300 }))).toBe(1);
        expect(watchedFraction(videoFixture({ durationSeconds: 0, watchProgressSeconds: 30 }))).toBe(0);
    });
});
