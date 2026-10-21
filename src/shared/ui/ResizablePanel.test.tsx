import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { renderWithUi } from "../test/render";
import { ResizablePanel } from "./ResizablePanel";

type PanelProps = {
    side: "left" | "right";
    initialWidth?: number | null;
    collapsed?: boolean;
};

/** A panel that keeps its width like the app's callers do; at most 400px or half the window. */
function Panel({ side, initialWidth = 300, collapsed }: PanelProps) {
    const [width, setWidth] = useState<number | null>(initialWidth);
    return (
        <ResizablePanel
            aria-label="Panel"
            side={side}
            width={width}
            minWidth={200}
            maxWidth={400}
            maxViewportFraction={1 / 2}
            onWidthChange={setWidth}
            onReset={() => setWidth(null)}
            resizeLabel="Resize panel"
            autoWidthClassName="w-auto-panel"
            collapsed={collapsed}
            collapsedClassName="w-rail"
        >
            <p>Contents</p>
        </ResizablePanel>
    );
}

const panel = () => screen.getByRole("complementary", { name: "Panel" });
const edge = () => screen.getByRole("separator", { name: "Resize panel" });

function drag(from: number, to: number) {
    fireEvent.pointerDown(edge(), { clientX: from });
    fireEvent.pointerMove(window, { clientX: to, buttons: 1 });
    fireEvent.pointerUp(window);
}

describe("ResizablePanel", () => {
    it("widens a left panel when its right edge moves right, by pointer or keyboard", async () => {
        const { user } = renderWithUi(<Panel side="left" />);
        expect(edge()).toHaveClass("-right-1.5");
        expect(edge()).toHaveAttribute("aria-valuenow", "300");
        expect(edge()).toHaveAttribute("aria-valuemin", "200");
        expect(edge()).toHaveAttribute("aria-valuemax", "400");

        drag(300, 340);
        expect(panel()).toHaveStyle({ width: "340px" });

        edge().focus();
        await user.keyboard("{ArrowLeft}");
        expect(panel()).toHaveStyle({ width: "324px" });
        await user.keyboard("{ArrowRight}{ArrowRight}");
        expect(panel()).toHaveStyle({ width: "356px" });
    });

    it("widens a right panel when its left edge moves left", async () => {
        const { user } = renderWithUi(<Panel side="right" />);
        expect(edge()).toHaveClass("-left-1.5");

        drag(700, 660);
        expect(panel()).toHaveStyle({ width: "340px" });

        edge().focus();
        await user.keyboard("{ArrowLeft}");
        expect(panel()).toHaveStyle({ width: "356px" });
    });

    it("stays between its limits and within its part of the window", () => {
        renderWithUi(<Panel side="left" />);
        drag(300, -1000);
        expect(panel()).toHaveStyle({ width: "200px" });
        drag(200, 5000);
        expect(panel()).toHaveStyle({ width: `${Math.max(200, Math.min(400, window.innerWidth / 2))}px` });
    });

    it("drags only with the primary button", () => {
        renderWithUi(<Panel side="left" />);
        fireEvent.pointerDown(edge(), { clientX: 300, button: 2 });
        fireEvent.pointerMove(window, { clientX: 340, buttons: 2 });
        expect(panel()).toHaveStyle({ width: "300px" });
        expect(document.body).not.toHaveClass("cursor-col-resize");
    });

    it.each([
        ["the pointer is cancelled", () => fireEvent.pointerCancel(window)],
        ["the window loses focus", () => fireEvent.blur(window)],
        ["a move arrives with no button held", () => fireEvent.pointerMove(window, { clientX: 320, buttons: 0 })],
    ])("stops dragging when %s", (_, end) => {
        renderWithUi(<Panel side="left" />);
        fireEvent.pointerDown(edge(), { clientX: 300 });
        fireEvent.pointerMove(window, { clientX: 340, buttons: 1 });
        expect(document.body).toHaveClass("cursor-col-resize");

        end();
        expect(document.body).not.toHaveClass("cursor-col-resize");
        fireEvent.pointerMove(window, { clientX: 380, buttons: 1 });
        expect(panel()).toHaveStyle({ width: "340px" });
    });

    it("keeps arrow keys from reaching other shortcuts", async () => {
        const { user } = renderWithUi(<Panel side="left" />);
        let reached = 0;
        window.addEventListener("keydown", () => reached++);
        edge().focus();
        await user.keyboard("{ArrowRight}");
        expect(reached).toBe(0);
    });

    it("resets on double-click and starts from the rendered width when automatic", async () => {
        const { user } = renderWithUi(<Panel side="left" />);
        await user.dblClick(edge());
        expect(panel().style.width).toBe("");
        expect(panel()).toHaveClass("w-auto-panel");

        // An automatic width starts from the rendered one (jsdom has no layout, so 300 is faked).
        Object.defineProperty(panel(), "offsetWidth", { value: 300, configurable: true });
        edge().focus();
        await user.keyboard("{ArrowRight}");
        expect(panel()).toHaveStyle({ width: "316px" });
    });

    it("has no edge while collapsed and animates only when collapsible", () => {
        const { rerender } = renderWithUi(<Panel side="left" collapsed />);
        expect(screen.queryByRole("separator")).not.toBeInTheDocument();
        expect(panel()).toHaveClass("w-rail", "transition-[width]");
        expect(panel().style.width).toBe("");

        rerender(<Panel side="left" />);
        expect(panel()).not.toHaveClass("transition-[width]");
    });
});
