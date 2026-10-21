import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoHide } from "./useStageUi";

/** A stage with two controls and an outside button, reporting whether the controls are shown. */
function Stage({ playing }: { playing: boolean }) {
    const { visible, focusHandlers } = useAutoHide(playing);
    return (
        <>
            <div data-testid="stage" {...focusHandlers}>
                <button type="button">Play</button>
                <button type="button">Mute</button>
            </div>
            <button type="button">Outside</button>
            <output>{visible ? "shown" : "hidden"}</output>
        </>
    );
}

const state = () => screen.getByRole("status").textContent;
const button = (name: string) => screen.getByRole("button", { name });
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("useAutoHide", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("hides the controls after a while of playing, and never while paused", () => {
        const { rerender } = render(<Stage playing />);
        expect(state()).toBe("shown");
        wait(3000);
        expect(state()).toBe("hidden");

        rerender(<Stage playing={false} />);
        expect(state()).toBe("shown");
        wait(5000);
        expect(state()).toBe("shown");
    });

    it("shows them and keeps them while the keyboard moves through them", () => {
        // Regression: Tab moved focus onto hidden, invisible controls.
        render(<Stage playing />);
        wait(3000);
        expect(state()).toBe("hidden");

        act(() => button("Play").focus());
        expect(state()).toBe("shown");
        wait(5000);
        act(() => button("Mute").focus());
        wait(5000);
        expect(state()).toBe("shown");

        // Leaving the stage starts the usual delay.
        act(() => button("Outside").focus());
        expect(state()).toBe("shown");
        wait(3000);
        expect(state()).toBe("hidden");
    });

    it("lets a clicked control hide with the rest", () => {
        render(<Stage playing />);
        // A mouse click focuses the button without `:focus-visible`.
        const play = button("Play");
        vi.spyOn(play, "matches").mockImplementation((selector) => selector !== ":focus-visible");
        act(() => play.focus());
        wait(3000);
        expect(state()).toBe("hidden");
    });
});
