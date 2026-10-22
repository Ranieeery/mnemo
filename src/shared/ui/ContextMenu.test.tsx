import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithUi } from "../test/render";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "./ContextMenu";

function Menu({ onSelect }: { onSelect: () => void }) {
    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <button type="button">Folder</button>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem disabled onSelect={onSelect}>
                    Locked
                </ContextMenuItem>
                <ContextMenuItem disabled disabledReason="Pinned items stay on top." onSelect={onSelect}>
                    Move down
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}

describe("ContextMenuItem", () => {
    it("explains why it is disabled, staying reachable but doing nothing", async () => {
        const onSelect = vi.fn();
        const { user } = renderWithUi(<Menu onSelect={onSelect} />);
        fireEvent.contextMenu(screen.getByRole("button", { name: "Folder" }));

        const explained = await screen.findByRole("menuitem", { name: "Move down" });
        expect(explained).toHaveAttribute("aria-disabled", "true");
        expect(screen.getByRole("menuitem", { name: "Locked" })).toHaveAttribute("aria-disabled", "true");

        // The arrow keys skip a plain disabled item, not one with a reason.
        await user.keyboard("{ArrowDown}");
        expect(explained).toHaveFocus();
        expect(await screen.findByRole("tooltip")).toHaveTextContent("Pinned items stay on top.");

        await user.keyboard("{Enter}");
        await user.click(explained);
        expect(onSelect).not.toHaveBeenCalled();
        expect(screen.getByRole("menu")).toBeInTheDocument();
    });
});
