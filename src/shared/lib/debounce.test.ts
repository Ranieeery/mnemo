import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "./debounce";

describe("debounce", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("runs once with the latest value after a quiet pause", () => {
        const run = vi.fn();
        const saver = debounce(run, 400);
        saver.schedule(1);
        vi.advanceTimersByTime(300);
        saver.schedule(2);
        vi.advanceTimersByTime(300);
        expect(run).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);
        expect(run).toHaveBeenCalledExactlyOnceWith(2);
    });

    it("flushes what is waiting right away, and nothing when nothing is", () => {
        const run = vi.fn();
        const saver = debounce(run, 400);
        saver.flush();
        expect(run).not.toHaveBeenCalled();

        saver.schedule("a");
        saver.flush();
        expect(run).toHaveBeenCalledExactlyOnceWith("a");
        vi.advanceTimersByTime(1000);
        expect(run).toHaveBeenCalledOnce();
    });
});
