import { describe, expect, it } from "vitest";
import type { HiddenFolder } from "../ipc/bindings";
import { libraryFolderFixture } from "../test/fixtures";
import { folderVisibility, nearestHiddenFolder } from "./folderVisibility";

function hiddenFolder(path: string): HiddenFolder {
    return {
        path,
        name: path.split("\\").at(-1) ?? path,
        libraryFolder: libraryFolderFixture(),
        available: true,
    };
}

const PRIVATE = hiddenFolder("D:\\Videos\\Private");
const NESTED = hiddenFolder("D:\\Videos\\Private\\More");

describe("folderVisibility", () => {
    it("tells a hidden folder from the folders inside it and from the rest", () => {
        const hidden = [PRIVATE];
        expect(folderVisibility("D:\\Videos\\Private", hidden)).toEqual({ kind: "hidden" });
        expect(folderVisibility("D:\\Videos\\Private\\", hidden)).toEqual({ kind: "hidden" });
        expect(folderVisibility("D:\\Videos\\Private\\Season 1", hidden)).toEqual({
            kind: "insideHidden",
            folder: PRIVATE,
        });
        expect(folderVisibility("D:\\Videos", hidden)).toEqual({ kind: "visible" });
        // Whole path components only.
        expect(folderVisibility("D:\\Videos\\Private 2", hidden)).toEqual({ kind: "visible" });
    });

    it("names the nearest hidden folder around a path", () => {
        expect(nearestHiddenFolder("D:\\Videos\\Private\\More\\a.mkv", [NESTED, PRIVATE])).toBe(NESTED);
        expect(nearestHiddenFolder("D:\\Videos\\Private\\More\\a.mkv", [PRIVATE, NESTED])).toBe(NESTED);
        expect(nearestHiddenFolder("D:\\Videos\\Private\\a.mkv", [PRIVATE, NESTED])).toBe(PRIVATE);
        expect(folderVisibility("D:\\Videos\\Private\\More", [PRIVATE, NESTED])).toEqual({ kind: "hidden" });
        expect(nearestHiddenFolder("D:\\Videos\\a.mkv", [PRIVATE, NESTED])).toBeUndefined();
    });
});
