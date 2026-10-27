import { describe, expect, it } from "vitest";
import { pointerFraction } from "./seekPreview";

describe("pointerFraction", () => {
    it("measures from the left edge of the bar", () => {
        expect(pointerFraction(150, 100, 200)).toBe(0.25);
        expect(pointerFraction(100, 100, 200)).toBe(0);
        expect(pointerFraction(300, 100, 200)).toBe(1);
    });

    it("stays within the bar when the pointer is past its ends", () => {
        expect(pointerFraction(40, 100, 200)).toBe(0);
        expect(pointerFraction(900, 100, 200)).toBe(1);
    });

    it("has nothing to say before the bar has a width", () => {
        expect(pointerFraction(150, 100, 0)).toBeNull();
        expect(pointerFraction(150, 100, Number.NaN)).toBeNull();
    });
});
