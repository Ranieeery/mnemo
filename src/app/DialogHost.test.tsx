import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { openVideoDetails } from "../shared/stores/dialogs";
import { videoFixture } from "../shared/test/fixtures";
import { callsOf, mockCommands } from "../shared/test/ipc";
import { renderScreen } from "../shared/test/render";
import { DialogHost } from "./DialogHost";

describe("video details dialog", () => {
    it("edits the title and description and manages tags", async () => {
        const video = videoFixture({ id: 9, title: "Pilot", description: "" });
        const calls = mockCommands({
            get_video_tags: [{ id: 1, name: "drama" }],
            list_tags: [
                { id: 1, name: "drama", videoCount: 3 },
                { id: 2, name: "favorites", videoCount: 5 },
            ],
            update_video_details: { ...video, title: "Pilot (remastered)" },
            add_tag_to_video: [],
            remove_tag_from_video: [],
        });
        const { user } = renderScreen(<DialogHost />);
        act(() => openVideoDetails(video));

        const dialog = await screen.findByRole("dialog", { name: "Video details" });
        const title = within(dialog).getByRole("textbox", { name: "Title" });
        await user.clear(title);
        await user.type(title, "Pilot (remastered)");
        await user.type(within(dialog).getByRole("textbox", { name: "Description" }), "First episode");
        await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
        await waitFor(() =>
            expect(callsOf(calls, "update_video_details")).toEqual([
                { id: 9, title: "Pilot (remastered)", description: "First episode" },
            ])
        );

        expect(await within(dialog).findByText("drama")).toBeInTheDocument();
        await user.click(within(dialog).getByRole("button", { name: "Remove tag drama" }));
        await user.click(within(dialog).getByRole("button", { name: "Add tag favorites" }));
        await user.type(within(dialog).getByRole("textbox", { name: "Add a tag" }), "Rewatch{Enter}");
        await waitFor(() =>
            expect(callsOf(calls, "add_tag_to_video")).toEqual([
                { videoId: 9, name: "favorites" },
                { videoId: 9, name: "Rewatch" },
            ])
        );
        expect(callsOf(calls, "remove_tag_from_video")).toEqual([{ videoId: 9, tagId: 1 }]);
    });

    it("does not save an empty title", async () => {
        mockCommands({ get_video_tags: [], list_tags: [] });
        const { user } = renderScreen(<DialogHost />);
        act(() => openVideoDetails(videoFixture({ title: "Pilot" })));

        const title = await screen.findByRole("textbox", { name: "Title" });
        await user.clear(title);
        expect(screen.getByText("The title cannot be empty.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    });
});
