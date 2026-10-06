import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithUi } from "../test/render";
import { ScrollContainer } from "./ScrollContainer";
import { ScrollToTopButton } from "./ScrollToTopButton";

function scrollTo(container: HTMLElement, top: number) {
    Object.defineProperty(container, "scrollTop", { value: top, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
    fireEvent.scroll(container);
}

describe("ScrollToTopButton", () => {
    it("shows up after scrolling past one screen and goes back to the top", async () => {
        const { user } = renderWithUi(
            <ScrollContainer className="page">
                <p>Long content</p>
                <ScrollToTopButton />
            </ScrollContainer>
        );
        const container = screen.getByText("Long content").parentElement;
        if (!container) {
            throw new Error("no scroll container");
        }
        const button = screen.getByRole("button", { name: "Back to top" });
        expect(button).toHaveClass("invisible");

        scrollTo(container, 400);
        expect(button).toHaveClass("invisible");
        scrollTo(container, 900);
        expect(button).not.toHaveClass("invisible");

        const scroll = vi.spyOn(container, "scrollTo");
        await user.click(button);
        expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    });
});
