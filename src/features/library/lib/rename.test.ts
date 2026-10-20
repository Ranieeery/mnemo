import { describe, expect, it } from "vitest";
import { libraryFolderFixture } from "../../../shared/test/fixtures";
import { renamed } from "./rename";

describe("renamed", () => {
    const folder = libraryFolderFixture({ path: "D:\\Anime 2019", folderName: "Anime 2019" });

    it("uses the trimmed name as the custom name", () => {
        expect(renamed(folder, "  Anime  ")).toMatchObject({ name: "Anime", customName: "Anime" });
    });

    it("shows the folder's own name for an empty value or the folder name itself", () => {
        const named = renamed(folder, "Anime");
        expect(renamed(named, "   ")).toMatchObject({ name: "Anime 2019", customName: null });
        expect(renamed(named, "Anime 2019")).toMatchObject({ name: "Anime 2019", customName: null });
    });
});
