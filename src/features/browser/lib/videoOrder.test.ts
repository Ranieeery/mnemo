import { describe, expect, it } from "vitest";
import type { VideoEntry, VideoGroup } from "../../../shared/ipc/bindings";
import { entryFixture, videoFixture } from "../../../shared/test/fixtures";
import { applyOrder, isStatusFilter, isVideoSort, matchesStatus, nextSort, sortEntries } from "./videoOrder";

const unread = (name: string): VideoEntry => ({ path: `D:\\Show\\${name}`, name, video: null });
const read = (id: number, name: string, overrides: Parameters<typeof videoFixture>[0] = {}) => ({
    ...entryFixture(videoFixture({ id, title: name, ...overrides })),
    name,
});

// In natural order, as the backend sends them.
const ep2 = read(2, "Ep 2", { durationSeconds: 1500, createdAt: "2026-01-02 10:00:00" });
const ep10 = read(10, "Ep 10", { durationSeconds: 600, createdAt: "2026-01-03 10:00:00" });
const ep11 = read(11, "Ep 11", { durationSeconds: 600, createdAt: "2026-01-01 10:00:00" });
const extra = unread("Extra.mkv");
const natural = [ep2, ep10, ep11, extra];

const names = (entries: readonly VideoEntry[]) => entries.map((entry) => entry.name);

describe("sortEntries", () => {
    it("keeps the natural name order, or reverses it", () => {
        expect(names(sortEntries(natural, "name-asc"))).toEqual(["Ep 2", "Ep 10", "Ep 11", "Extra.mkv"]);
        expect(names(sortEntries(natural, "name-desc"))).toEqual(["Extra.mkv", "Ep 11", "Ep 10", "Ep 2"]);
    });

    it("sorts by duration, breaking ties by name and leaving unread videos last", () => {
        expect(names(sortEntries(natural, "duration-asc"))).toEqual(["Ep 10", "Ep 11", "Ep 2", "Extra.mkv"]);
        expect(names(sortEntries(natural, "duration-desc"))).toEqual(["Ep 2", "Ep 10", "Ep 11", "Extra.mkv"]);
    });

    it("sorts by date added, leaving unread videos last", () => {
        expect(names(sortEntries(natural, "added-desc"))).toEqual(["Ep 10", "Ep 2", "Ep 11", "Extra.mkv"]);
        expect(names(sortEntries(natural, "added-asc"))).toEqual(["Ep 11", "Ep 2", "Ep 10", "Extra.mkv"]);
    });

    it("does not change the list it is given", () => {
        sortEntries(natural, "name-desc");
        expect(names(natural)).toEqual(["Ep 2", "Ep 10", "Ep 11", "Extra.mkv"]);
    });
});

describe("matchesStatus", () => {
    const watched = read(1, "watched", { isWatched: true, watchProgressSeconds: 1500 });
    const started = read(2, "started", { watchProgressSeconds: 30 });
    const fresh = read(3, "fresh");

    it.each([
        ["watched", [watched]],
        ["in-progress", [started]],
        ["unwatched", [fresh, extra]],
        ["all", [watched, started, fresh, extra]],
    ] as const)("keeps %s videos", (status, expected) => {
        expect([watched, started, fresh, extra].filter((entry) => matchesStatus(entry, status))).toEqual(expected);
    });
});

describe("applyOrder", () => {
    const groups: VideoGroup[] = [
        { folderPath: "D:\\Show", relativePath: "", entries: [ep2, ep10] },
        { folderPath: "D:\\Show\\S2", relativePath: "S2", entries: [ep11, extra] },
    ];

    it("sorts inside each group", () => {
        const ordered = applyOrder(groups, { sort: "name-desc", status: "all" });
        expect(ordered.map((group) => names(group.entries))).toEqual([
            ["Ep 10", "Ep 2"],
            ["Extra.mkv", "Ep 11"],
        ]);
    });

    it("drops groups the filter empties", () => {
        const ordered = applyOrder(groups, { sort: "name-asc", status: "unwatched" });
        expect(ordered.map((group) => group.relativePath)).toEqual(["", "S2"]);
        expect(applyOrder(groups, { sort: "name-asc", status: "watched" })).toEqual([]);
    });
});

describe("nextSort", () => {
    it("sorts a newly chosen field ascending and reverses the current one", () => {
        expect(nextSort("name-asc", "duration")).toBe("duration-asc");
        expect(nextSort("duration-desc", "added")).toBe("added-asc");
        expect(nextSort("duration-asc", "duration")).toBe("duration-desc");
        expect(nextSort("duration-desc", "duration")).toBe("duration-asc");
    });
});

describe("guards", () => {
    it("accept only known values", () => {
        expect(isVideoSort("duration-desc")).toBe(true);
        expect(isVideoSort("duration")).toBe(false);
        expect(isVideoSort(undefined)).toBe(false);
        expect(isStatusFilter("in-progress")).toBe(true);
        expect(isStatusFilter("started")).toBe(false);
    });
});
