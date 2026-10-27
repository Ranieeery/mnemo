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

    it("shows the next video's thumbnail beside its title, which stays the dialog's description", () => {
        const pictured = entryFixture(videoFixture({ id: 3, title: "Pictured", thumbnailPath: "next.jpg" }));
        renderWithUi(<NextVideoDialog next={pictured} onPlay={() => {}} onCancel={() => {}} />);
        const dialog = screen.getByRole("dialog", { name: "Up next in 5s" });
        expect(dialog.querySelector("img")).toHaveAttribute("src", expect.stringContaining("next.jpg"));
        // The picture is decorative: the description is the title alone, not its duration too.
        expect(dialog).toHaveAccessibleDescription("Pictured");
    });

    it("shows the thumbnail in the mini player's card too", () => {
        const pictured = entryFixture(videoFixture({ id: 3, title: "Pictured", thumbnailPath: "next.jpg" }));
        renderWithUi(<NextVideoDialog next={pictured} compact onPlay={() => {}} onCancel={() => {}} />);
        const card = screen.getByRole("dialog", { name: "Up next in 5s" });
        expect(card.querySelector("img")).toHaveAttribute("src", expect.stringContaining("next.jpg"));
        expect(card).toHaveTextContent("Pictured");
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
