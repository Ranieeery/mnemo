import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VideoThumbnail } from "./VideoThumbnail";

describe("VideoThumbnail", () => {
    it("shows the placeholder when the image fails, and tries again when the thumbnail changes", () => {
        // The thumbnail is decorative (empty alt), so it is found by tag rather than role.
        const { container, rerender } = render(<VideoThumbnail thumbnailPath="old.jpg" />);
        const image = container.querySelector("img");
        expect(image).not.toBeNull();
        if (image) {
            fireEvent.error(image);
        }
        expect(container.querySelector("img")).toBeNull();

        rerender(<VideoThumbnail thumbnailPath="new.jpg" />);
        expect(container.querySelector("img")).toHaveAttribute("src", expect.stringContaining("new.jpg"));
    });
});
