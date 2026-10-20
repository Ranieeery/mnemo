import { describe, expect, it } from "vitest";
import type { LibraryFolder } from "../../../shared/ipc/bindings";
import { libraryFolderFixture } from "../../../shared/test/fixtures";
import { breadcrumbs } from "./breadcrumbs";

function folder(path: string, name: string): LibraryFolder {
    return libraryFolderFixture({ path, name });
}

describe("breadcrumbs", () => {
    const library = [folder("D:\\Videos", "Videos"), folder("D:\\Videos\\Courses", "Courses")];

    it("starts at the closest library folder", () => {
        expect(breadcrumbs("D:\\Videos\\Courses\\Rust\\Module 1", library)).toEqual([
            { name: "Courses", path: "D:\\Videos\\Courses" },
            { name: "Rust", path: "D:\\Videos\\Courses\\Rust" },
            { name: "Module 1", path: "D:\\Videos\\Courses\\Rust\\Module 1" },
        ]);
    });

    it("is a single crumb for a library folder itself", () => {
        expect(breadcrumbs("D:\\Videos", library)).toEqual([{ name: "Videos", path: "D:\\Videos" }]);
    });

    it("names the library folder by its custom name", () => {
        const renamed = [
            libraryFolderFixture({ path: "D:\\Anime 2019", folderName: "Anime 2019", customName: "Anime" }),
        ];
        expect(breadcrumbs("D:\\Anime 2019\\Season 1", renamed)).toEqual([
            { name: "Anime", path: "D:\\Anime 2019" },
            { name: "Season 1", path: "D:\\Anime 2019\\Season 1" },
        ]);
    });

    it("does not match sibling folders sharing a prefix", () => {
        expect(breadcrumbs("D:\\Videos 2\\Show", library)).toEqual([{ name: "Show", path: "D:\\Videos 2\\Show" }]);
    });
});
