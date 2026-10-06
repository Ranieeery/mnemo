import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FolderIcon, loadAllIcons, SUGGESTED_FOLDER_ICONS } from "./FolderIcon";

describe("FolderIcon", () => {
    it("draws a suggested icon right away", () => {
        const { container } = render(<FolderIcon name="film" />);
        expect(container.querySelector("svg")).toHaveClass("lucide-film");
        expect(SUGGESTED_FOLDER_ICONS).toContain("gamepad-2");
    });

    it("loads any other lucide icon on demand", async () => {
        // In tests React only retries a suspended render inside act().
        const { container } = await act(async () => render(<FolderIcon name="zodiac-pisces" />));
        await act(() => loadAllIcons());
        expect(container.querySelector("svg")).toHaveClass("lucide-zodiac-pisces");
    });

    it("falls back to the folder icon for emojis saved by older versions and unknown names", async () => {
        const { container, rerender } = render(<FolderIcon name="🎬" />);
        expect(container.querySelector("svg")).toHaveClass("lucide-folder");
        rerender(<FolderIcon name="toString" />);
        expect(container.querySelector("svg")).toHaveClass("lucide-folder");
        rerender(<FolderIcon name="no-such-icon" />);
        await act(() => loadAllIcons());
        expect(container.querySelector("svg")).toHaveClass("lucide-folder");
    });
});
