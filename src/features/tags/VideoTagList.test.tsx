import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { callsOf, commandError, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { VideoTagList } from "./components/VideoTagList";

describe("VideoTagList", () => {
    it("lists a video's tags", async () => {
        mockCommands({
            get_video_tags: [
                { id: 1, name: "anime" },
                { id: 2, name: "rewatch" },
            ],
        });
        renderScreen(<VideoTagList videoId={7} />);
        const list = await screen.findByRole("list", { name: "Tags" });
        expect(list).toHaveTextContent("anime");
        expect(list).toHaveTextContent("rewatch");
    });

    it("shows nothing for a video without tags", async () => {
        const calls = mockCommands({ get_video_tags: [] });
        const { queryClient } = renderScreen(<VideoTagList videoId={7} />);
        await waitFor(() => expect(callsOf(calls, "get_video_tags")).toHaveLength(1));
        await waitFor(() => expect(queryClient.isFetching()).toBe(0));
        expect(screen.queryByRole("list", { name: "Tags" })).not.toBeInTheDocument();
    });

    it("says when the tags cannot be read", async () => {
        mockCommands({
            get_video_tags: () => {
                throw commandError("database", "database is locked");
            },
        });
        renderScreen(<VideoTagList videoId={7} />);
        expect(await screen.findByText(/Could not load the tags: database is locked/)).toBeInTheDocument();
    });
});
