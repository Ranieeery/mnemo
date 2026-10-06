import { describe, expect, it } from "vitest";
import { validateFolderSearch } from "./searchParams";

describe("validateFolderSearch", () => {
    it("keeps a valid sort and status filter", () => {
        expect(validateFolderSearch({ path: "D:\\Show", sort: "duration-desc", status: "watched" })).toEqual({
            path: "D:\\Show",
            sort: "duration-desc",
            status: "watched",
        });
    });

    it("drops unknown values, so the folder falls back to its defaults", () => {
        expect(validateFolderSearch({ path: "D:\\Show", q: "pilot", sort: "size", status: 3 })).toEqual({
            path: "D:\\Show",
            q: "pilot",
        });
    });
});
