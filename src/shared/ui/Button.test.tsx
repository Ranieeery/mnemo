import { screen } from "@testing-library/react";
import { Play } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { renderWithUi } from "../test/render";
import { Button } from "./Button";
import { IconButton } from "./IconButton";

describe("Button", () => {
    it("runs its action on click", async () => {
        const onClick = vi.fn();
        const { user } = renderWithUi(<Button onClick={onClick}>Export library</Button>);
        await user.click(screen.getByRole("button", { name: "Export library" }));
        expect(onClick).toHaveBeenCalledOnce();
    });

    it("is busy and cannot be clicked while loading", async () => {
        const onClick = vi.fn();
        const { user } = renderWithUi(
            <Button loading onClick={onClick}>
                Importing
            </Button>
        );
        const button = screen.getByRole("button", { name: "Importing" });
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute("aria-busy", "true");
        await user.click(button);
        expect(onClick).not.toHaveBeenCalled();
    });

    it("does not submit forms unless asked to", () => {
        renderWithUi(<Button>Save</Button>);
        expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
    });
});

describe("IconButton", () => {
    it("is named by its label and shows it with the shortcut as a tooltip", async () => {
        const { user } = renderWithUi(<IconButton label="Play" shortcut="K" icon={<Play />} />);
        const button = screen.getByRole("button", { name: "Play" });
        await user.hover(button);
        const tooltip = await screen.findByRole("tooltip");
        expect(tooltip).toHaveTextContent("Play");
        expect(tooltip).toHaveTextContent("K");
    });

    it("reports toggle state", () => {
        renderWithUi(<IconButton label="Subtitles" icon={<Play />} pressed />);
        expect(screen.getByRole("button", { name: "Subtitles" })).toHaveAttribute("aria-pressed", "true");
    });
});
