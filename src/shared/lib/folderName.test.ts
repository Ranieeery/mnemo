import { describe, expect, it } from "vitest";
import { libraryFolderFixture } from "../test/fixtures";
import { folderName } from "./folderName";

describe("folderName", () => {
    const library = [libraryFolderFixture({ path: "D:\\Anime 2019", folderName: "Anime 2019", customName: "Anime" })];

    it("names a library folder by its name in the app", () => {
        expect(folderName("D:\\Anime 2019", library)).toBe("Anime");
        expect(folderName("D:\\Anime 2019\\", library)).toBe("Anime");
    });

    it("names any other folder by its own name", () => {
        expect(folderName("D:\\Anime 2019\\Season 1", library)).toBe("Season 1");
        expect(folderName("D:\\Anime 2019 extras", library)).toBe("Anime 2019 extras");
        expect(folderName("D:\\Movies", undefined)).toBe("Movies");
    });
});
