import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { callsOf, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { TagManager } from "./components/TagManager";

const tags = [
    { id: 1, name: "anime", videoCount: 12 },
    { id: 2, name: "old", videoCount: 0 },
];

describe("TagManager", () => {
    it("lists tags with their usage", async () => {
        mockCommands({ list_tags: tags });
        renderScreen(<TagManager />);
        expect(await screen.findByText("2 tags, 1 unused")).toBeInTheDocument();
        expect(screen.getByText("12 videos")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: 'Remove "old" from all videos' })).toBeDisabled();
    });

    it("deletes unused tags after confirmation", async () => {
        const calls = mockCommands({ list_tags: tags, delete_unused_tags: 1 });
        const { user } = renderScreen(<TagManager />);
        await user.click(await screen.findByRole("button", { name: "Delete unused tags" }));
        const dialog = await screen.findByRole("alertdialog", { name: "Delete 1 unused tags?" });
        await user.click(within(dialog).getByRole("button", { name: "Delete unused tags" }));
        expect(await screen.findByText("Deleted 1 unused tag")).toBeInTheDocument();
        expect(callsOf(calls, "delete_unused_tags")).toHaveLength(1);
    });

    it("removes a tag from every video, keeping the tag", async () => {
        const calls = mockCommands({ list_tags: tags, remove_tag_from_all_videos: 12 });
        const { user } = renderScreen(<TagManager />);
        await user.click(await screen.findByRole("button", { name: 'Remove "anime" from all videos' }));
        await user.click(await screen.findByRole("button", { name: "Remove from videos" }));
        expect(await screen.findByText('Removed "anime" from 12 videos')).toBeInTheDocument();
        expect(callsOf(calls, "remove_tag_from_all_videos")).toEqual([{ tagId: 1 }]);
    });

    it("guides the user when there are no tags", async () => {
        mockCommands({ list_tags: [] });
        renderScreen(<TagManager />);
        expect(await screen.findByRole("heading", { name: "No tags yet" })).toBeInTheDocument();
    });
});
