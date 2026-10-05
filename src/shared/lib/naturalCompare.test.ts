import { describe, expect, it } from "vitest";
import { naturalCompare } from "./naturalCompare";

describe("naturalCompare", () => {
    it("orders embedded numbers by value", () => {
        const names = ["Ep 10", "Ep 2", "Ep 1", "Ep 21", "Ep 3"];
        expect(names.sort(naturalCompare)).toEqual(["Ep 1", "Ep 2", "Ep 3", "Ep 10", "Ep 21"]);
    });

    it("orders numbers inside longer names", () => {
        const names = ["S01E10.mkv", "S01E02.mkv", "S02E01.mkv", "S01E01.mkv"];
        expect(names.sort(naturalCompare)).toEqual(["S01E01.mkv", "S01E02.mkv", "S01E10.mkv", "S02E01.mkv"]);
    });

    it("ignores case and accents", () => {
        expect(naturalCompare("aula", "Aula")).toBe(0);
        expect(naturalCompare("Módulo", "modulo")).toBe(0);
    });

    it("keeps plain alphabetical order", () => {
        expect(naturalCompare("alpha", "beta")).toBeLessThan(0);
        expect(naturalCompare("beta", "alpha")).toBeGreaterThan(0);
    });
});
