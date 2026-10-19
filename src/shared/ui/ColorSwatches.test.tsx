import { screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithUi } from "../test/render";
import { ColorSwatches } from "./ColorSwatches";

const OPTIONS = [
    { value: "white", label: "White", color: "var(--color-subtitle-white)" },
    { value: "yellow", label: "Yellow", color: "var(--color-subtitle-yellow)" },
    { value: "cyan", label: "Cyan", color: "var(--color-subtitle-cyan)" },
] as const;
type Option = (typeof OPTIONS)[number]["value"];

function Swatches({ onChange }: { onChange?: (value: Option) => void }) {
    const [value, setValue] = useState<Option>("yellow");
    return (
        <ColorSwatches
            label="Text color"
            value={value}
            options={OPTIONS}
            onChange={(next) => {
                setValue(next);
                onChange?.(next);
            }}
        />
    );
}

const swatch = (name: string) => screen.getByRole("radio", { name });

describe("ColorSwatches", () => {
    it("names every swatch and marks the chosen one with more than its color", () => {
        renderWithUi(<Swatches />);
        expect(screen.getByRole("radiogroup", { name: "Text color" })).toBeInTheDocument();
        expect(swatch("Yellow")).toHaveAttribute("aria-checked", "true");
        expect(swatch("Yellow")).toHaveClass("ring-2");
        expect(swatch("Yellow").querySelector("svg")).toHaveClass("lucide-check");
        expect(swatch("White")).toHaveAttribute("aria-checked", "false");
        expect(swatch("White").querySelector("svg")).toBeNull();
        expect(swatch("Cyan")).toHaveStyle({ backgroundColor: "var(--color-subtitle-cyan)" });
    });

    it("is one tab stop whose arrows, Home and End move the choice", async () => {
        const onChange = vi.fn();
        const { user } = renderWithUi(
            <>
                <button type="button">Before</button>
                <Swatches onChange={onChange} />
            </>
        );
        await user.click(screen.getByRole("button", { name: "Before" }));
        await user.tab();
        expect(swatch("Yellow")).toHaveFocus();

        await user.keyboard("{ArrowRight}");
        expect(swatch("Cyan")).toHaveFocus();
        expect(swatch("Cyan")).toHaveAttribute("aria-checked", "true");
        await user.keyboard("{ArrowDown}");
        expect(swatch("White")).toHaveAttribute("aria-checked", "true");
        await user.keyboard("{ArrowLeft}");
        expect(swatch("Cyan")).toHaveAttribute("aria-checked", "true");
        await user.keyboard("{Home}");
        expect(swatch("White")).toHaveFocus();
        await user.keyboard("{End}");
        expect(swatch("Cyan")).toHaveFocus();
        expect(onChange.mock.calls.map(([value]) => value)).toEqual(["cyan", "white", "cyan", "white", "cyan"]);

        // Only the chosen swatch is in the tab order.
        expect(screen.getAllByRole("radio").filter((radio) => radio.tabIndex === 0)).toEqual([swatch("Cyan")]);
    });

    it("chooses by clicking", async () => {
        const { user } = renderWithUi(<Swatches />);
        await user.click(swatch("White"));
        expect(swatch("White")).toHaveAttribute("aria-checked", "true");
        expect(swatch("Yellow")).toHaveAttribute("aria-checked", "false");
    });
});
