import { describe, expect, it } from "vitest";
import { chunk } from "./chunk";

describe("chunk", () => {
    it("splits into rows of the given size, the last one shorter", () => {
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
        expect(chunk([1, 2, 3, 4], 2)).toEqual([
            [1, 2],
            [3, 4],
        ]);
    });

    it("returns no rows for no items", () => {
        expect(chunk([], 3)).toEqual([]);
    });
});
