import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithUi } from "../test/render";
import { toast } from "./Toast";

describe("Toast", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("keeps a toast with an action longer, to leave time to act on it", () => {
        vi.useFakeTimers();
        renderWithUi(<p>App</p>);
        act(() => {
            toast({ title: "Saved" });
            toast({ title: "Mnemo 2.7.0 is available", action: { label: "View release", onClick: () => {} } });
        });

        act(() => vi.advanceTimersByTime(5000));
        expect(screen.queryByText("Saved")).not.toBeInTheDocument();
        expect(screen.getByText("Mnemo 2.7.0 is available")).toBeInTheDocument();

        act(() => vi.advanceTimersByTime(3500));
        expect(screen.queryByText("Mnemo 2.7.0 is available")).not.toBeInTheDocument();
    });
});
