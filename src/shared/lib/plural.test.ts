import { describe, expect, it } from "vitest";
import { plural, pluralNoun } from "./plural";

describe("plural", () => {
    it("uses the singular only for one", () => {
        expect(plural(0, "file")).toBe("0 files");
        expect(plural(1, "file")).toBe("1 file");
        expect(plural(12, "file")).toBe("12 files");
    });
});

describe("pluralNoun", () => {
    it("gives the noun alone, singular only for one", () => {
        expect(pluralNoun(0, "tag")).toBe("tags");
        expect(pluralNoun(1, "tag")).toBe("tag");
        expect(pluralNoun(2, "tag")).toBe("tags");
    });
});
