import { describe, expect, it } from "vitest";
import type { LibraryFolderSort } from "../../../shared/ipc/bindings";
import { chosenSort, type FolderSortOption, sortState } from "./folderSort";

describe("sortState", () => {
    it.each<[LibraryFolderSort, FolderSortOption, "asc" | "desc" | null]>([
        ["custom", "custom", null],
        ["nameAscending", "name", "asc"],
        ["nameDescending", "name", "desc"],
        ["oldestFirst", "added", "asc"],
        ["newestFirst", "added", "desc"],
        ["recentlyWatched", "recentlyWatched", null],
    ])("shows %s as %s, %s", (sort, option, direction) => {
        expect(sortState(sort)).toEqual({ option, direction });
    });
});

describe("chosenSort", () => {
    // Every saved mode, and the modes saved by choosing Name and Date added from it.
    it.each<[LibraryFolderSort, LibraryFolderSort, LibraryFolderSort]>([
        ["custom", "nameAscending", "oldestFirst"],
        ["nameAscending", "nameDescending", "oldestFirst"],
        ["nameDescending", "nameAscending", "oldestFirst"],
        ["oldestFirst", "nameAscending", "newestFirst"],
        ["newestFirst", "nameAscending", "oldestFirst"],
        ["recentlyWatched", "nameAscending", "oldestFirst"],
    ])("from %s, choosing Name saves %s and Date added saves %s", (current, byName, byDate) => {
        expect(chosenSort(current, "name")).toBe(byName);
        expect(chosenSort(current, "added")).toBe(byDate);
        expect(chosenSort(current, "custom")).toBe("custom");
        expect(chosenSort(current, "recentlyWatched")).toBe("recentlyWatched");
    });
});
