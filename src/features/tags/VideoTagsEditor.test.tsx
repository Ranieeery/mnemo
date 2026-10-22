import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Tag } from "../../shared/ipc/bindings";
import { mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { VideoTagsEditor } from "./components/VideoTagsEditor";

function renderEditor(assigned: Tag[], existing: Tag[]) {
    let tags = assigned;
    mockCommands({
        get_video_tags: () => tags,
        list_tags: () => [...assigned, ...existing].map((tag) => ({ ...tag, videoCount: tags.includes(tag) ? 1 : 0 })),
        remove_tag_from_video: ({ tagId }: Record<string, unknown>) => {
            tags = tags.filter((tag) => tag.id !== tagId);
            return null;
        },
        add_tag_to_video: ({ name }: Record<string, unknown>) => {
            tags = [...tags, ...existing.filter((tag) => tag.name === name)];
            return tags;
        },
    });
    return renderScreen(<VideoTagsEditor videoId={9} />);
}

describe("VideoTagsEditor", () => {
    it("keeps focus in the list when a tag is removed, then moves it to the field", async () => {
        const { user } = renderEditor(
            [
                { id: 1, name: "drama" },
                { id: 2, name: "anime" },
            ],
            []
        );
        await user.click(await screen.findByRole("button", { name: "Remove tag drama" }));
        await waitFor(() => expect(screen.getByRole("button", { name: "Remove tag anime" })).toHaveFocus());

        await user.keyboard("{Enter}");
        await waitFor(() => expect(screen.getByRole("textbox", { name: "Add a tag" })).toHaveFocus());
        expect(screen.getByText("No tags yet.")).toBeInTheDocument();
    });

    it("moves focus to the next suggestion after using one", async () => {
        const { user } = renderEditor(
            [],
            [
                { id: 1, name: "favorites" },
                { id: 2, name: "comedy" },
            ]
        );
        await user.click(await screen.findByRole("button", { name: "Add tag favorites" }));
        await waitFor(() => expect(screen.getByRole("button", { name: "Add tag comedy" })).toHaveFocus());
        expect(await screen.findByRole("button", { name: "Remove tag favorites" })).toBeInTheDocument();
    });
});
