import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FolderIcon, isFolderIconName } from "./FolderIcon";

describe("FolderIcon", () => {
    it("recognizes stored icon names only", () => {
        expect(isFolderIconName("film")).toBe(true);
        expect(isFolderIconName("gamepad-2")).toBe(true);
        expect(isFolderIconName("🎬")).toBe(false);
        expect(isFolderIconName("toString")).toBe(false);
        expect(isFolderIconName(null)).toBe(false);
    });

    it("draws the chosen icon, and the folder icon for emojis saved by older versions", () => {
        const { container, rerender } = render(<FolderIcon name="film" />);
        expect(container.querySelector("svg")).toHaveClass("lucide-film");
        rerender(<FolderIcon name="🎬" />);
        expect(container.querySelector("svg")).toHaveClass("lucide-folder");
    });
});
