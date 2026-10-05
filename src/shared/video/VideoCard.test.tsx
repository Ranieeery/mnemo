import { useQuery } from "@tanstack/react-query";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Video } from "../ipc/bindings";
import { queryKeys } from "../ipc/queryKeys";
import { videoFixture } from "../test/fixtures";
import { callsOf, commandError, mockCommands } from "../test/ipc";
import { renderScreen } from "../test/render";
import { toEntry } from "./entry";
import { VideoCard } from "./VideoCard";

/** A card fed by a cached query, like the real screens, so optimistic updates are visible. */
function CachedCard({ load }: { load: () => Video }) {
    const query = useQuery({
        queryKey: queryKeys.librarySearch("card"),
        queryFn: () => [load()],
    });
    const video = query.data?.[0];
    return video ? <VideoCard entry={toEntry(video)} /> : null;
}

async function markWatchedFromMenu(title: string) {
    fireEvent.contextMenu(await screen.findByRole("button", { name: title }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Mark as watched" }));
}

describe("VideoCard", () => {
    it("marks a video as watched right away from its menu", async () => {
        let stored = videoFixture({ id: 7, title: "Pilot" });
        const calls = mockCommands({
            set_watched: () => {
                stored = { ...stored, isWatched: true };
                return stored;
            },
        });
        renderScreen(<CachedCard load={() => stored} />);

        await markWatchedFromMenu("Pilot");
        expect(await screen.findByRole("button", { name: "Pilot, watched" })).toBeInTheDocument();
        expect(callsOf(calls, "set_watched")).toEqual([{ id: 7, watched: true }]);
    });

    it("rolls back and explains when the change fails", async () => {
        const video = videoFixture({ id: 7, title: "Pilot" });
        mockCommands({
            set_watched: () => {
                throw commandError("notFound", "video 7 not found");
            },
        });
        renderScreen(<CachedCard load={() => video} />);

        await markWatchedFromMenu("Pilot");
        expect(await screen.findByText("Could not update the video")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Pilot" })).toBeInTheDocument();
    });

    it("opens the built-in player when clicked", async () => {
        const video = videoFixture({ id: 3, title: "Movie", filePath: "D:\\Videos\\Movie.mkv" });
        mockCommands({});
        const { user, router } = renderScreen(<VideoCard entry={toEntry(video)} />);

        await user.click(await screen.findByRole("button", { name: "Movie" }));
        expect(router.state.location.pathname).toBe("/watch");
        expect(router.state.location.search).toEqual({ path: "D:\\Videos\\Movie.mkv" });
    });
});
