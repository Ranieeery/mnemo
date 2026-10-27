import { describe, expect, it } from "vitest";
import { greeting } from "./greeting";

describe("greeting", () => {
    it("follows the local hour", () => {
        expect(greeting(5)).toBe("Good morning");
        expect(greeting(11)).toBe("Good morning");
        expect(greeting(12)).toBe("Good afternoon");
        expect(greeting(17)).toBe("Good afternoon");
        expect(greeting(18)).toBe("Good evening");
        expect(greeting(23)).toBe("Good evening");
    });

    it("keeps the evening through the small hours", () => {
        expect(greeting(0)).toBe("Good evening");
        expect(greeting(4)).toBe("Good evening");
    });
});
