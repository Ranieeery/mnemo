import { describe, expect, it } from "vitest";
import { columnsFor } from "./useColumns";

describe("columnsFor", () => {
    it.each([
        [0, 1],
        [219, 1],
        [220, 1],
        [456, 2],
        [700, 3],
        [1200, 5],
    ])("fits %spx into %s columns of 220px with 16px gaps", (width, columns) => {
        expect(columnsFor(width, 220, 16)).toBe(columns);
    });
});
