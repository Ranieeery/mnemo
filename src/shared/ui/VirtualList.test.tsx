import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollContainer } from "./ScrollContainer";
import { VirtualList } from "./VirtualList";

function renderList(count: number) {
    const items = Array.from({ length: count }, (_, index) => `Episode ${index + 1}`);
    render(
        <ScrollContainer className="h-96">
            <VirtualList items={items} getKey={(item) => item} estimateSize={() => 40} renderItem={(item) => item} />
        </ScrollContainer>
    );
}

describe("VirtualList", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("renders short lists directly", () => {
        renderList(10);
        expect(screen.getByText("Episode 1")).toBeInTheDocument();
        expect(screen.getByText("Episode 10")).toBeInTheDocument();
    });

    it("renders only the items near the viewport of long lists", () => {
        // jsdom has no layout: give every element a 400px tall box so the viewport fits ten 40px rows.
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 400));
        vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
        vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);

        renderList(1000);
        expect(screen.getByText("Episode 1")).toBeInTheDocument();
        expect(screen.queryByText("Episode 500")).not.toBeInTheDocument();
        expect(screen.queryByText("Episode 1000")).not.toBeInTheDocument();
    });
});
