import { describe, expect, it } from "vitest";
import { capitalize } from "./capitalize";

describe("capitalize", () => {
    it("upper-cases only the first letter", () => {
        expect(capitalize("teal")).toBe("Teal");
        expect(capitalize("dark blue")).toBe("Dark blue");
        expect(capitalize("")).toBe("");
    });
});
