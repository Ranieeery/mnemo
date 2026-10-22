import { describe, expect, it } from "vitest";
import { type FoundVersion, parseArguments, VERSION_FILES, versionProblems } from "./versions";

function reader(path: string) {
    const file = VERSION_FILES.find((candidate) => candidate.path === path);
    if (!file) {
        throw new Error(`no reader for ${path}`);
    }
    return file.read;
}

function everywhere(version: string): FoundVersion[] {
    return VERSION_FILES.map(({ path }) => ({ path, version }));
}

describe("version files", () => {
    it("reads the version of each file", () => {
        expect(reader("package.json")('{ "name": "mnemo", "version": "2.6.0" }')).toBe("2.6.0");
        expect(reader("src-tauri/tauri.conf.json")('{ "productName": "mnemo", "version": "2.6.0" }')).toBe("2.6.0");
        expect(reader("README.md")("<p>\n  <strong>Version 2.6.0</strong> - Desktop application\n</p>")).toBe("2.6.0");
        expect(
            reader("src-tauri/Cargo.toml")(
                '[package]\nname = "mnemo"\nversion = "2.6.0"\nedition = "2024"\n\n[dependencies]\nsemver = "1"\n'
            )
        ).toBe("2.6.0");
    });

    it("reads the app's own entry of Cargo.lock, not a crate sharing its version", () => {
        const lock = [
            "[[package]]",
            'name = "memchr"',
            'version = "2.7.0"',
            "",
            "[[package]]",
            'name = "mnemo"',
            'version = "2.6.0"',
            "dependencies = [",
        ].join("\r\n");
        expect(reader("src-tauri/Cargo.lock")(lock)).toBe("2.6.0");
    });

    it("finds nothing where the version is missing", () => {
        expect(reader("package.json")("not json")).toBeNull();
        expect(reader("package.json")('{ "version": 2 }')).toBeNull();
        expect(
            reader("src-tauri/Cargo.toml")('[package]\nname = "mnemo"\n\n[dependencies]\nversion = "1"\n')
        ).toBeNull();
        expect(reader("src-tauri/Cargo.lock")('[[package]]\nname = "other"\nversion = "1.0.0"\n')).toBeNull();
        expect(reader("README.md")("# Mnemo")).toBeNull();
    });
});

describe("versionProblems", () => {
    it("accepts the same release version everywhere, and a matching tag", () => {
        expect(versionProblems(everywhere("2.6.0"))).toEqual([]);
        expect(versionProblems(everywhere("2.6.0"), "2.6.0")).toEqual([]);
    });

    it("lists every file when they disagree", () => {
        const found = everywhere("2.6.0").map((entry) =>
            entry.path === "README.md" ? { ...entry, version: "2.5.0" } : entry
        );
        const [problem, ...rest] = versionProblems(found);
        expect(rest).toEqual([]);
        expect(problem).toContain("different versions");
        expect(problem).toContain("README.md: 2.5.0");
        expect(problem).toContain("package.json: 2.6.0");
    });

    it("reports missing and malformed versions", () => {
        const found = everywhere("2.6.0").map((entry) =>
            entry.path === "package.json" ? { ...entry, version: null } : entry
        );
        expect(versionProblems(found)).toEqual(["package.json: no version found"]);
        expect(versionProblems(everywhere("2.7.0-beta.1"))).toHaveLength(VERSION_FILES.length);
    });

    it("checks the tag against the version", () => {
        expect(versionProblems(everywhere("2.6.0"), "2.7.0")).toEqual([
            "the tag 2.7.0 differs from the version in the files (2.6.0)",
        ]);
        expect(versionProblems(everywhere("2.6.0"), "v2.6.0")).toEqual([
            'the tag "v2.6.0" is not a release version (X.Y.Z); tags have no "v", use 2.6.0',
        ]);
        expect(versionProblems(everywhere("2.6.0"), "latest")).toHaveLength(1);
    });
});

describe("parseArguments", () => {
    it("takes an optional tag", () => {
        expect(parseArguments([])).toEqual({});
        expect(parseArguments(["--tag", "2.7.0"])).toEqual({ tag: "2.7.0" });
    });

    it("refuses anything else", () => {
        for (const args of [["--tag"], ["2.7.0"], ["--tag", "2.7.0", "extra"], ["--tag", "--verbose"], ["--network"]]) {
            expect(parseArguments(args)).toHaveProperty("error");
        }
    });
});
