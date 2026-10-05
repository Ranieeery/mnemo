import { describe, expect, it } from "vitest";
import { baseName, isWithin, joinPath, parentPath, pathSeparator, relativeSegments } from "./paths";

describe("pathSeparator", () => {
    it("detects Windows and POSIX paths", () => {
        expect(pathSeparator("D:\\Videos\\Show")).toBe("\\");
        expect(pathSeparator("/home/me/Videos")).toBe("/");
    });
});

describe("isWithin", () => {
    it("accepts the folder itself and its descendants", () => {
        expect(isWithin("D:\\Videos", "D:\\Videos")).toBe(true);
        expect(isWithin("D:\\Videos\\Show\\S1", "D:\\Videos")).toBe(true);
        expect(isWithin("/m/Show/e1.mkv", "/m/Show/")).toBe(true);
    });

    it("rejects siblings that share a prefix", () => {
        expect(isWithin("D:\\Videos 2\\a.mkv", "D:\\Videos")).toBe(false);
        expect(isWithin("/m/Showcase", "/m/Show")).toBe(false);
    });

    it("works with a drive root", () => {
        expect(isWithin("D:\\Videos", "D:\\")).toBe(true);
    });
});

describe("relativeSegments", () => {
    it("splits the part below the folder", () => {
        expect(relativeSegments("D:\\Videos\\Show\\S1", "D:\\Videos")).toEqual(["Show", "S1"]);
        expect(relativeSegments("D:\\Videos", "D:\\Videos")).toEqual([]);
        expect(relativeSegments("E:\\Other", "D:\\Videos")).toBeNull();
    });
});

describe("joinPath and baseName", () => {
    it("keep the platform separator", () => {
        expect(joinPath("D:\\Videos", "Show", "S1")).toBe("D:\\Videos\\Show\\S1");
        expect(joinPath("/m/", "Show")).toBe("/m/Show");
    });

    it("return the last component", () => {
        expect(baseName("D:\\Videos\\Show\\")).toBe("Show");
        expect(baseName("/m/Show/e1.mkv")).toBe("e1.mkv");
        expect(baseName("D:\\")).toBe("D:");
    });
});

describe("parentPath", () => {
    it("drops the last component", () => {
        expect(parentPath("D:\\Videos\\Show\\Ep 1.mkv")).toBe("D:\\Videos\\Show");
        expect(parentPath("/m/Show/")).toBe("/m");
        expect(parentPath("file.mkv")).toBe("file.mkv");
    });
});
