import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryEntry, HistoryPage as HistoryPageData } from "../../shared/ipc/bindings";
import { videoFixture } from "../../shared/test/fixtures";
import { callsOf, commandError, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { HistoryPage } from "./components/HistoryPage";

function entry(id: number, day: string, time = "20:15:00"): HistoryEntry {
    return {
        video: videoFixture({ id, title: `Episode ${id}`, isWatched: true }),
        day,
        watchedAt: `${day}T${time}Z`,
    };
}

const firstPage: HistoryPageData = {
    entries: [entry(3, "2026-03-11"), entry(2, "2026-03-11"), entry(1, "2026-03-10")],
    nextCursor: { watchedAt: "2026-03-10 20:15:00", videoId: 1 },
};
const olderPage: HistoryPageData = { entries: [entry(9, "2026-02-01")], nextCursor: null };

function mockHistory(extra: Record<string, unknown> = {}) {
    return mockCommands({
        list_watch_history: ({ cursor }: Record<string, unknown>) => (cursor ? olderPage : firstPage),
        get_watch_totals: [
            { day: "2026-03-10", videos: 1, seconds: 1500 },
            { day: "2026-03-11", videos: 2, seconds: 3000 },
        ],
        ...extra,
    });
}

describe("HistoryPage", () => {
    beforeEach(() => {
        // Wednesday, March 11, 2026, in the evening.
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date(2026, 2, 11, 21, 0));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("lists watched videos by day and loads older ones on request", async () => {
        const calls = mockHistory();
        const { user } = renderScreen(<HistoryPage />);

        expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Yesterday" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Episode 3/ })).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Show older" }));
        expect(await screen.findByRole("heading", { name: "Sunday, February 1" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Show older" })).not.toBeInTheDocument();
        expect(callsOf(calls, "list_watch_history")).toEqual([
            { cursor: null, limit: 50 },
            { cursor: firstPage.nextCursor, limit: 50 },
        ]);
    });

    it("opens a watched video in the player", async () => {
        mockHistory();
        const { user, router } = renderScreen(<HistoryPage />);
        await user.click(await screen.findByRole("button", { name: /Episode 2/ }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/watch"));
        expect(router.state.location.search).toEqual({ path: videoFixture({ id: 2 }).filePath });
    });

    it("shows watched time per day and per week on its own tab", async () => {
        const calls = mockHistory();
        const { user } = renderScreen(<HistoryPage />);
        await user.click(await screen.findByRole("tab", { name: "Statistics" }));

        const days = await screen.findByRole("list", { name: "Watched time per day" });
        expect(within(days).getAllByRole("button")).toHaveLength(14);
        expect(within(days).getByRole("button", { name: "Wednesday, March 11: 50 min, 2 videos" })).toBeInTheDocument();
        expect(screen.getByText("1 h 15 min")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Weeks" }));
        const weeks = screen.getByRole("list", { name: "Watched time per week" });
        expect(within(weeks).getAllByRole("button")).toHaveLength(12);
        expect(
            within(weeks).getByRole("button", { name: "Week of March 9: 1 h 15 min, 3 videos" })
        ).toBeInTheDocument();
        // One request covers both views: 11 full weeks plus Monday to Wednesday.
        expect(callsOf(calls, "get_watch_totals")).toEqual([{ days: 80 }]);
    });

    it("guides the user when nothing was watched yet", async () => {
        mockHistory({ list_watch_history: { entries: [], nextCursor: null }, get_watch_totals: [] });
        const { user } = renderScreen(<HistoryPage />);
        expect(await screen.findByRole("heading", { name: "Nothing watched yet" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Go to home" })).toBeInTheDocument();

        await user.click(screen.getByRole("tab", { name: "Statistics" }));
        expect(
            await screen.findByRole("heading", { name: "Nothing finished in the last 12 weeks" })
        ).toBeInTheDocument();
    });

    it("offers a retry when the history cannot be loaded", async () => {
        let attempts = 0;
        mockHistory({
            list_watch_history: () => {
                attempts += 1;
                if (attempts === 1) {
                    throw commandError("database", "database is locked");
                }
                return firstPage;
            },
        });
        const { user } = renderScreen(<HistoryPage />);
        expect(await screen.findByText("database is locked")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
    });

    it("says so when older videos cannot be loaded", async () => {
        mockHistory({
            list_watch_history: ({ cursor }: Record<string, unknown>) => {
                if (cursor) {
                    throw commandError("database", "disk I/O error");
                }
                return firstPage;
            },
        });
        const { user } = renderScreen(<HistoryPage />);
        await user.click(await screen.findByRole("button", { name: "Show older" }));
        expect(await screen.findByText("Could not load older videos")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Show older" })).toBeEnabled();
    });
});
