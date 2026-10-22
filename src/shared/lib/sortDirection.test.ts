import { describe, expect, it } from "vitest";
import { nextDirection } from "./sortDirection";

describe("nextDirection", () => {
    it("sorts a newly chosen field ascending and reverses the current one", () => {
        expect(nextDirection(null)).toBe("asc");
        expect(nextDirection("asc")).toBe("desc");
        expect(nextDirection("desc")).toBe("asc");
    });
});
