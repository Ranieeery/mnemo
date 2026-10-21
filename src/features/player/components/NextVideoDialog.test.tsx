import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { entryFixture, videoFixture } from "../../../shared/test/fixtures";
import { renderWithUi } from "../../../shared/test/render";
import { NextVideoDialog } from "./NextVideoDialog";

const next = entryFixture(videoFixture({ id: 2, title: "The Second One" }));

describe("NextVideoDialog", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("counts down and plays the next video once, even if opening it takes a while", () => {
        // Regression: the countdown kept going below zero and asked to play the next video again every second.
        const onPlay = vi.fn();
        render(onPlay);
        expect(screen.getByRole("dialog", { name: "Up next in 5s" })).toHaveTextContent("The Second One");

        waitSeconds(4);
        expect(screen.getByRole("dialog", { name: "Up next in 1s" })).toBeInTheDocument();
        expect(onPlay).not.toHaveBeenCalled();

        waitSeconds(5);
        expect(onPlay).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("dialog", { name: "Up next in 0s" })).toBeInTheDocument();
    });

    it("cancels with Escape without playing", () => {
        const onPlay = vi.fn();
        const onCancel = vi.fn();
        render(onPlay, onCancel);

        act(() => {
            screen.getByRole("dialog").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        });

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onPlay).not.toHaveBeenCalled();
    });
});

/** Each second is its own tick: the next one is scheduled after the dialog renders the last. */
function waitSeconds(seconds: number) {
    for (let elapsed = 0; elapsed < seconds; elapsed++) {
        act(() => vi.advanceTimersByTime(1000));
    }
}

function render(onPlay: () => void, onCancel: () => void = () => {}) {
    return renderWithUi(<NextVideoDialog next={next} onPlay={onPlay} onCancel={onCancel} />);
}
