import { describe, expect, it, vi } from "vitest";
import { videoFixture } from "../../../shared/test/fixtures";
import { ProgressSaver, resumePosition, SAVE_INTERVAL_MS } from "./progress";

describe("resumePosition", () => {
    // Regression (B1): the legacy player always started from 0.
    it("resumes a video in progress from its saved position", () => {
        expect(resumePosition(videoFixture({ watchProgressSeconds: 754 }), 1500)).toBe(754);
    });

    it("starts over for watched videos, unknown videos and positions near the edges", () => {
        expect(resumePosition(videoFixture({ watchProgressSeconds: 754, isWatched: true }), 1500)).toBe(0);
        expect(resumePosition(null, 1500)).toBe(0);
        expect(resumePosition(videoFixture({ watchProgressSeconds: 3 }), 1500)).toBe(0);
        expect(resumePosition(videoFixture({ watchProgressSeconds: 1495 }), 1500)).toBe(0);
    });
});

describe("ProgressSaver", () => {
    function setup() {
        let time = 0;
        const save = vi.fn();
        const saver = new ProgressSaver(save, () => time);
        return { saver, save, advance: (ms: number) => (time += ms) };
    }

    // Regression (B2): the legacy player wrote to the database on every time update (~4 times per second).
    it("saves at most once per interval while playing", () => {
        const { saver, save, advance } = setup();
        for (let second = 1; second <= 12; second++) {
            advance(250);
            saver.tick(second / 4);
        }
        expect(save).toHaveBeenCalledTimes(1);

        advance(SAVE_INTERVAL_MS);
        saver.tick(20);
        expect(save).toHaveBeenCalledTimes(2);
        expect(save).toHaveBeenLastCalledWith(20, false);
    });

    it("saves right away on pause, without repeating the last position", () => {
        const { saver, save } = setup();
        saver.tick(10);
        saver.flush(10);
        saver.flush(12);
        expect(save.mock.calls).toEqual([
            [10, false],
            [12, false],
        ]);
    });

    it("ignores the very start and marks the end as finished", () => {
        const { saver, save } = setup();
        saver.tick(0);
        saver.flush(0);
        saver.finish(1500);
        expect(save.mock.calls).toEqual([[1500, true]]);
    });
});
