import { describe, expect, it } from "vitest";
import { dayKey } from "./dayKey";

describe("dayKey", () => {
    it("writes the local day with zero padding", () => {
        expect(dayKey(new Date(2026, 2, 5, 12))).toBe("2026-03-05");
        expect(dayKey(new Date(2026, 11, 31, 12))).toBe("2026-12-31");
    });

    it("keeps the local day near midnight, whatever the UTC day is", () => {
        expect(dayKey(new Date(2026, 9, 21, 0, 0))).toBe("2026-10-21");
        expect(dayKey(new Date(2026, 9, 21, 23, 59))).toBe("2026-10-21");
    });
});
