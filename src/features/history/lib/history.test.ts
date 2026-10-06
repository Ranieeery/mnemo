import { describe, expect, it } from "vitest";
import { videoFixture } from "../../../shared/test/fixtures";
import {
    axisTicks,
    CHART_DAYS,
    CHART_WEEKS,
    dailyPeriods,
    dayKey,
    dayLabel,
    formatWatchTime,
    groupByDay,
    totalsDaysNeeded,
    weeklyPeriods,
} from "./history";

// Wednesday, March 11, 2026.
const today = new Date(2026, 2, 11, 18, 30);

describe("dayLabel", () => {
    it("names today and yesterday, and writes other days out", () => {
        expect(dayLabel("2026-03-11", today)).toBe("Today");
        expect(dayLabel("2026-03-10", today)).toBe("Yesterday");
        expect(dayLabel("2026-03-02", today)).toBe("Monday, March 2");
        expect(dayLabel("2025-12-31", today)).toBe("Wednesday, December 31, 2025");
    });

    it("handles yesterday across a month and year boundary", () => {
        expect(dayLabel("2025-12-31", new Date(2026, 0, 1, 9))).toBe("Yesterday");
    });
});

describe("formatWatchTime", () => {
    it.each([
        [0, "0 min"],
        [20, "< 1 min"],
        [45 * 60, "45 min"],
        [2 * 3600, "2 h"],
        [2 * 3600 + 10 * 60 + 20, "2 h 10 min"],
    ])("formats %d seconds as %s", (seconds, text) => {
        expect(formatWatchTime(seconds)).toBe(text);
    });
});

describe("groupByDay", () => {
    it("keeps the order and starts a group whenever the day changes", () => {
        const entry = (id: number, day: string) => ({
            video: videoFixture({ id }),
            day,
            watchedAt: `${day}T12:00:00Z`,
        });
        const groups = groupByDay([entry(1, "2026-03-11"), entry(2, "2026-03-11"), entry(3, "2026-03-09")]);
        expect(groups.map((group) => [group.day, group.entries.map((item) => item.video.id)])).toEqual([
            ["2026-03-11", [1, 2]],
            ["2026-03-09", [3]],
        ]);
    });
});

describe("dailyPeriods", () => {
    it("fills the days without history and ends today", () => {
        const periods = dailyPeriods([{ day: "2026-03-10", videos: 2, seconds: 3000 }], today);
        expect(periods).toHaveLength(CHART_DAYS);
        expect(periods.at(-1)?.key).toBe("2026-03-11");
        expect(periods[0]?.key).toBe("2026-02-26");
        expect(periods.at(-2)).toMatchObject({
            videos: 2,
            seconds: 3000,
            description: "Tuesday, March 10: 50 min, 2 videos",
        });
        expect(periods.at(-1)?.description).toBe("Wednesday, March 11: nothing watched");
    });

    it("steps over a daylight saving change one calendar day at a time", () => {
        // Many time zones switch on the last Sunday of March or the second Sunday of March.
        const keys = dailyPeriods([], new Date(2026, 3, 2, 0, 30)).map((period) => period.key);
        expect(new Set(keys).size).toBe(CHART_DAYS);
        expect(keys.at(-1)).toBe("2026-04-02");
        expect(keys[0]).toBe("2026-03-20");
    });
});

describe("weeklyPeriods", () => {
    it("adds the days up into Monday-to-Sunday weeks", () => {
        const periods = weeklyPeriods(
            [
                { day: "2026-03-09", videos: 1, seconds: 600 },
                { day: "2026-03-11", videos: 2, seconds: 1200 },
                { day: "2026-03-08", videos: 1, seconds: 300 },
            ],
            today
        );
        expect(periods).toHaveLength(CHART_WEEKS);
        expect(periods.at(-1)).toMatchObject({ key: "2026-03-09", videos: 3, seconds: 1800 });
        expect(periods.at(-2)).toMatchObject({ key: "2026-03-02", videos: 1, seconds: 300 });
        expect(periods.at(-1)?.description).toBe("Week of March 9: 30 min, 3 videos");
    });

    it("crosses the year boundary", () => {
        const periods = weeklyPeriods([{ day: "2025-12-31", videos: 1, seconds: 60 }], new Date(2026, 0, 2, 12));
        expect(periods.at(-1)).toMatchObject({ key: "2025-12-29", videos: 1 });
    });
});

describe("totalsDaysNeeded", () => {
    it("reaches back to the Monday of the first week shown", () => {
        const days = totalsDaysNeeded(today);
        expect(days).toBe((CHART_WEEKS - 1) * 7 + 3);
        expect(days).toBeGreaterThanOrEqual(CHART_DAYS);
        const firstDay = new Date(today);
        firstDay.setDate(today.getDate() - days + 1);
        expect(dayKey(firstDay)).toBe(weeklyPeriods([], today)[0]?.key);
    });
});

describe("axisTicks", () => {
    it("picks round steps and covers the largest value", () => {
        expect(axisTicks(0)).toEqual([0, 300]);
        expect(axisTicks(50 * 60)).toEqual([0, 900, 1800, 2700, 3600]);
        expect(axisTicks(3.2 * 3600)).toEqual([0, 3600, 7200, 10800, 14400]);
        const ticks = axisTicks(40 * 3600);
        expect(ticks.length).toBeLessThanOrEqual(5);
        expect(ticks.at(-1)).toBeGreaterThanOrEqual(40 * 3600);
    });
});
