import { describe, expect, it } from "vitest";
import { videoFixture } from "../test/fixtures";
import { entryDescription, entryTitle, toEntry, watchedFraction } from "./entry";

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

describe("entryDescription", () => {
    const entry = (video: ReturnType<typeof videoFixture> | null) => ({ path: "x", name: "Ep 1.mkv", video });

    it("puts the progress, the duration and the detail line in words", () => {
        const started = videoFixture({ durationSeconds: 1500, watchProgressSeconds: 600 });
        expect(entryDescription(entry(started), "Show › Season 1")).toBe("40% watched, 25:00, Show › Season 1");
    });

    it("leaves out the progress of a video not started or already watched", () => {
        expect(entryDescription(entry(videoFixture({ durationSeconds: 1500 })))).toBe("25:00");
        const watched = videoFixture({ durationSeconds: 1500, watchProgressSeconds: 600, isWatched: true });
        expect(entryDescription(entry(watched))).toBe("25:00");
    });

    it("never says 0% for a video that was started", () => {
        const barely = videoFixture({ durationSeconds: 3600, watchProgressSeconds: 5 });
        expect(entryDescription(entry(barely))).toBe("1% watched, 1:00:00");
    });

    it("says when a video is not processed yet, and is empty when there is nothing to add", () => {
        expect(entryDescription(entry(null), "Show")).toBe("Show, Not processed");
        expect(entryDescription(entry(videoFixture({ durationSeconds: 0 })))).toBe("");
    });
});
