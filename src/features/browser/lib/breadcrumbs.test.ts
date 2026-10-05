import { describe, expect, it } from "vitest";
import type { LibraryFolder } from "../../../shared/ipc/bindings";
import { breadcrumbs } from "./breadcrumbs";

function folder(path: string, name: string): LibraryFolder {
    return { id: 1, path, name, customIcon: null, createdAt: null };
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

    it("does not match sibling folders sharing a prefix", () => {
        expect(breadcrumbs("D:\\Videos 2\\Show", library)).toEqual([{ name: "Show", path: "D:\\Videos 2\\Show" }]);
    });
});
