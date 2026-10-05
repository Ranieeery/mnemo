import { describe, expect, it } from "vitest";
import type { HomeData, Video } from "../ipc/bindings";
import { videoFixture } from "../test/fixtures";
import { replaceVideo } from "./replaceVideo";

describe("replaceVideo", () => {
    const first = videoFixture({ id: 1, title: "Pilot" });
    const second = videoFixture({ id: 2, title: "Second" });
    const watched: Video = { ...first, isWatched: true };

    it("replaces the video in every section of nested data", () => {
        const home: HomeData = {
            continueWatching: [first],
            recentlyWatched: [second, first],
            suggestions: [],
            folderPreviews: [
                { folder: { id: 1, path: "D:\\V", name: "V", customIcon: null, createdAt: null }, videos: [first] },
            ],
        };
        const next = replaceVideo(home, watched);
        expect(next.continueWatching[0]).toBe(watched);
        expect(next.recentlyWatched[1]).toBe(watched);
        expect(next.folderPreviews[0]?.videos[0]).toBe(watched);
    });

    it("keeps untouched branches and the whole object when nothing matches", () => {
        const entries = [
            { path: "a", name: "a", video: second },
            { path: "b", name: "b", video: null },
        ];
        const next = replaceVideo({ suggestions: [second], entries }, watched);
        expect(next.entries).toBe(entries);

        const untouched = { list: [second] };
        expect(replaceVideo(untouched, watched)).toBe(untouched);
    });

    it("passes primitives and null through", () => {
        expect(replaceVideo(null, watched)).toBeNull();
        expect(replaceVideo(3, watched)).toBe(3);
    });
});
