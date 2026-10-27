import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { callsOf, commandError, mockCommands } from "../test/ipc";
import { renderWithUi } from "../test/render";
import { followZoomKeys } from "./zoom";

/** A backend that keeps the level, stepping like the real one around 100%. */
function mockZoom() {
    let level = 1;
    const steps: Record<string, number> = { in: 0.25, out: -0.25 };
    return mockCommands({
        change_zoom: ({ step }: { step: string }) => {
            level = step === "reset" ? 1 : level + (steps[step] ?? 0);
            return { level };
        },
    });
}

let stop: (() => void) | null = null;

function follow() {
    stop = followZoomKeys();
}

afterEach(() => {
    stop?.();
    stop = null;
});

describe("followZoomKeys", () => {
    it("zooms with Ctrl +, Ctrl - and Ctrl 0, showing one toast with the level", async () => {
        const calls = mockZoom();
        renderWithUi(<p>Screen</p>);
        follow();

        fireEvent.keyDown(window, { key: "=", ctrlKey: true });
        expect(await screen.findByText("Zoom 125%")).toBeInTheDocument();
        fireEvent.keyDown(window, { key: "+", ctrlKey: true, shiftKey: true });
        expect(await screen.findByText("Zoom 150%")).toBeInTheDocument();
        // The newer level replaces the toast rather than piling up.
        await waitFor(() => expect(screen.queryByText("Zoom 125%")).not.toBeInTheDocument());

        fireEvent.keyDown(window, { key: "-", ctrlKey: true });
        expect(await screen.findByText("Zoom 125%")).toBeInTheDocument();
        fireEvent.keyDown(window, { key: "0", ctrlKey: true });
        expect(await screen.findByText("Zoom 100%")).toBeInTheDocument();

        expect(callsOf(calls, "change_zoom")).toEqual([
            { step: "in" },
            { step: "in" },
            { step: "out" },
            { step: "reset" },
        ]);
    });

    it("offers to reset from the toast, and leaves keys without Ctrl alone", async () => {
        const calls = mockZoom();
        const { user } = renderWithUi(<p>Screen</p>);
        follow();

        fireEvent.keyDown(window, { key: "=" });
        fireEvent.keyDown(window, { key: "-", ctrlKey: true });
        const toast = (await screen.findByText("Zoom 75%")).closest("li");
        await user.click(within(toast as HTMLElement).getByRole("button", { name: "Reset" }));
        expect(await screen.findByText("Zoom 100%")).toBeInTheDocument();
        expect(callsOf(calls, "change_zoom")).toEqual([{ step: "out" }, { step: "reset" }]);
    });

    it("zooms with Ctrl and the wheel, one step per gesture in flight", async () => {
        const calls = mockZoom();
        renderWithUi(<p>Screen</p>);
        follow();

        act(() => {
            fireEvent.wheel(window, { deltaY: -100, ctrlKey: true });
            fireEvent.wheel(window, { deltaY: -100, ctrlKey: true });
        });
        expect(await screen.findByText("Zoom 125%")).toBeInTheDocument();
        fireEvent.wheel(window, { deltaY: 100 });
        expect(callsOf(calls, "change_zoom")).toEqual([{ step: "in" }]);
    });

    it("says when the zoom cannot change", async () => {
        mockCommands({
            change_zoom: () => {
                throw commandError("internal", "webview gone");
            },
        });
        renderWithUi(<p>Screen</p>);
        follow();

        fireEvent.keyDown(window, { key: "0", ctrlKey: true });
        expect(await screen.findByText("Could not change the zoom")).toBeInTheDocument();
        expect(screen.getByText("webview gone")).toBeInTheDocument();
    });
});
