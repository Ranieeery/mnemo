import { describe, expect, it } from "vitest";
import type { LibraryEntry } from "../../../shared/ipc/bindings";
import { libraryFolderFixture, libraryGroupFixture, libraryLayoutFixture } from "../../../shared/test/fixtures";
import {
    arrangementChanged,
    flatFolders,
    folderPosition,
    groupsOf,
    layoutOf,
    mapFolders,
    mapGroup,
    moveToGroup,
    stepFolder,
    stepGroup,
} from "./folderLayout";

const series = libraryGroupFixture({ id: 10, name: "Series" });
const courses = libraryGroupFixture({ id: 20, name: "Courses", collapsed: true });
const loose = libraryFolderFixture({ id: 1, path: "D:\\Loose", name: "Loose" });
const dark = libraryFolderFixture({ id: 2, path: "D:\\Dark", name: "Dark", groupId: 10 });
const wire = libraryFolderFixture({ id: 3, path: "D:\\Wire", name: "Wire", groupId: 10 });
const last = libraryFolderFixture({ id: 4, path: "D:\\Last", name: "Last" });

/** Loose, Series [Dark, Wire], Last, Courses []. */
const library = libraryLayoutFixture([loose, dark, wire, last], [series, courses]);

/** The names in list order, a group's folders after it in brackets. */
function names(entries: LibraryEntry[] | null) {
    return entries?.map((entry) =>
        entry.kind === "folder"
            ? entry.folder.name
            : `${entry.group.name} [${entry.folders.map((folder) => folder.name).join(", ")}]`
    );
}

describe("library layout", () => {
    it("lists the folders and the groups, and what is sent to store it", () => {
        expect(names(library)).toEqual(["Loose", "Series [Dark, Wire]", "Last", "Courses []"]);
        expect(flatFolders(library).map((folder) => folder.id)).toEqual([1, 2, 3, 4]);
        expect(groupsOf(library)).toEqual([series, courses]);
        expect(layoutOf(library)).toEqual([
            { kind: "folder", id: 1 },
            { kind: "group", id: 10, folders: [2, 3] },
            { kind: "folder", id: 4 },
            { kind: "group", id: 20, folders: [] },
        ]);
    });

    it("tells where a folder is", () => {
        expect(folderPosition(library, 3)).toEqual({ group: series, index: 1, count: 2 });
        expect(folderPosition(library, 4)).toEqual({ group: null, index: 2, count: 4 });
        expect(folderPosition(library, 99)).toBeNull();
    });

    it("moves a folder to the end of a group or of the list, taking its group", () => {
        const moved = moveToGroup(library, 1, 10);
        expect(names(moved)).toEqual(["Series [Dark, Wire, Loose]", "Last", "Courses []"]);
        expect(flatFolders(moved).find((folder) => folder.id === 1)?.groupId).toBe(10);

        const out = moveToGroup(library, 2, null);
        expect(names(out)).toEqual(["Loose", "Series [Wire]", "Last", "Courses []", "Dark"]);
        expect(flatFolders(out).at(-1)?.groupId).toBeNull();

        expect(names(moveToGroup(library, 1, 99))).toEqual(names(library));
    });

    it("steps folders within their list and groups within the list, not past the edges", () => {
        expect(names(stepFolder(library, 2, 1))).toEqual(["Loose", "Series [Wire, Dark]", "Last", "Courses []"]);
        expect(stepFolder(library, 3, 1)).toBeNull();
        // A group counts as one place.
        expect(names(stepFolder(library, 1, 1))).toEqual(["Series [Dark, Wire]", "Loose", "Last", "Courses []"]);
        expect(stepFolder(library, 1, -1)).toBeNull();

        expect(names(stepGroup(library, 20, -1))).toEqual(["Loose", "Series [Dark, Wire]", "Courses []", "Last"]);
        expect(stepGroup(library, 20, 1)).toBeNull();
    });

    it("changes folders and groups where they are listed", () => {
        const renamed = mapFolders(library, (folder) => ({ ...folder, name: folder.name.toUpperCase() }));
        expect(names(renamed)).toEqual(["LOOSE", "Series [DARK, WIRE]", "LAST", "Courses []"]);
        const opened = mapGroup(library, 20, (group) => ({ ...group, collapsed: false }));
        expect(groupsOf(opened)[1]?.collapsed).toBe(false);
    });

    it("tells whether an arrangement changed the order or the groups", () => {
        expect(arrangementChanged(library, [...library])).toBe(false);
        expect(arrangementChanged(library, moveToGroup(library, 4, 10))).toBe(true);
        expect(arrangementChanged(library, stepGroup(library, 20, -1) ?? [])).toBe(true);
    });
});
