import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsTruncated } from "./useIsTruncated";

/** Records the observers so the test can report a resize, which jsdom never does. */
const observers: { callback: ResizeObserverCallback; observer: ResizeObserver }[] = [];

class RecordingResizeObserver {
    constructor(callback: ResizeObserverCallback) {
        observers.push({ callback, observer: this });
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

function Name({ text }: { text: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const truncated = useIsTruncated(ref, text);
    return (
        <span ref={ref} data-truncated={truncated}>
            {text}
        </span>
    );
}

function resize() {
    for (const { callback, observer } of observers) {
        callback([], observer);
    }
}

/** jsdom has no layout: fakes the element's text height against its visible height. */
function setHeights(element: HTMLElement, scrollHeight: number, clientHeight: number) {
    Object.defineProperty(element, "scrollHeight", { value: scrollHeight, configurable: true });
    Object.defineProperty(element, "clientHeight", { value: clientHeight, configurable: true });
}

describe("useIsTruncated", () => {
    afterEach(() => {
        observers.length = 0;
        vi.unstubAllGlobals();
    });

    it("is measured again when the element resizes", () => {
        vi.stubGlobal("ResizeObserver", RecordingResizeObserver);
        render(<Name text="A very long folder name" />);
        const name = screen.getByText("A very long folder name");
        expect(name).toHaveAttribute("data-truncated", "false");

        // The panel got narrower: the text now needs three lines but shows two.
        setHeights(name, 60, 40);
        act(() => resize());
        expect(name).toHaveAttribute("data-truncated", "true");

        setHeights(name, 40, 40);
        act(() => resize());
        expect(name).toHaveAttribute("data-truncated", "false");
    });

    it("is measured again when the text changes", () => {
        const { rerender } = render(<Name text="Short" />);
        const name = screen.getByText("Short");
        expect(name).toHaveAttribute("data-truncated", "false");

        setHeights(name, 60, 40);
        rerender(<Name text="Now much longer" />);
        expect(name).toHaveAttribute("data-truncated", "true");
    });
});
