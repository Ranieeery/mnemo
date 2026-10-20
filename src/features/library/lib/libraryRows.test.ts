import { describe, expect, it } from "vitest";
import type { LibraryEntry, LibraryGroup } from "../../../shared/ipc/bindings";
import { libraryFolderFixture, libraryGroupFixture, libraryLayoutFixture } from "../../../shared/test/fixtures";
import { entriesOf, type LibraryRow, libraryRows, moveRow } from "./libraryRows";

const series = libraryGroupFixture({ id: 10, name: "Series" });
const courses = libraryGroupFixture({ id: 20, name: "Courses", collapsed: true });
const empty = libraryGroupFixture({ id: 30, name: "Empty" });
const loose = libraryFolderFixture({ id: 1, name: "Loose" });
const dark = libraryFolderFixture({ id: 2, name: "Dark", groupId: 10 });
const wire = libraryFolderFixture({ id: 3, name: "Wire", groupId: 10 });
const intro = libraryFolderFixture({ id: 4, name: "Intro", groupId: 20 });
const last = libraryFolderFixture({ id: 5, name: "Last" });

/** Loose, Series [Dark, Wire], Courses [Intro] (collapsed), Last. */
const library = libraryLayoutFixture([loose, dark, wire, intro, last], [series, courses]);
const expandUnlessCollapsed = { expanded: (group: LibraryGroup) => !group.collapsed };

function ids(rows: LibraryRow[]) {
    return rows.map((row) => row.id);
}

function names(entries: LibraryEntry[]) {
    return entries.map((entry) =>
        entry.kind === "folder"
            ? entry.folder.name
            : `${entry.group.name} [${entry.folders.map((folder) => folder.name).join(", ")}]`
    );
}

/** The library after dragging `active` over `over`. */
function dragged(active: string | number, over: string | number, entries = library) {
    const rows = libraryRows(entries, expandUnlessCollapsed);
    return names(entriesOf(moveRow(rows, active, over), entries));
}

describe("library rows", () => {
    it("lists a group's header, its folders and its end, or only the header when collapsed", () => {
        const rows = libraryRows(library, expandUnlessCollapsed);
        expect(ids(rows)).toEqual([1, "group:10", 2, 3, "end:10", "group:20", 5]);
        expect(names(entriesOf(rows, library))).toEqual(names(library));
    });

    it("leaves empty groups out when asked, putting them back where they were", () => {
        const withEmpty = [...library.slice(0, 2), { kind: "group", group: empty, folders: [] }, ...library.slice(2)];
        expect(ids(libraryRows(withEmpty as LibraryEntry[], expandUnlessCollapsed))).toContain("end:30");

        const rail = libraryRows(withEmpty as LibraryEntry[], { expanded: () => true, skipEmptyGroups: true });
        expect(ids(rail)).not.toContain("group:30");
        expect(names(entriesOf(rail, withEmpty as LibraryEntry[]))).toEqual([
            "Loose",
            "Series [Dark, Wire]",
            "Empty []",
            "Courses [Intro]",
            "Last",
        ]);
    });

    it("puts a folder in a group when dropped before the group's end, and out of it past the end", () => {
        // Down over the last folder of the group: inside, last.
        expect(dragged(1, 3)).toEqual(["Series [Dark, Wire, Loose]", "Courses [Intro]", "Last"]);
        // Down over the end: out, right after the group.
        expect(dragged(3, "end:10")).toEqual(["Loose", "Series [Dark]", "Wire", "Courses [Intro]", "Last"]);
        // Up over the end: back inside.
        const out = libraryLayoutFixture([loose, dark, { ...wire, groupId: null }, intro, last], [series, courses]);
        expect(
            dragged(3, "end:10", [out[0], { ...out[1], folders: [dark] }, ...out.slice(2)] as LibraryEntry[])
        ).toEqual(["Loose", "Series [Dark, Wire]", "Courses [Intro]", "Last"]);
        // Up over a header: before the group.
        expect(dragged(2, "group:10")).toEqual(["Loose", "Dark", "Series [Wire]", "Courses [Intro]", "Last"]);
    });

    it("keeps a collapsed group's folders, and moves folders past it without entering it", () => {
        expect(dragged(5, "group:20")).toEqual(["Loose", "Series [Dark, Wire]", "Last", "Courses [Intro]"]);
        expect(dragged(1, "group:20")).toEqual(["Series [Dark, Wire]", "Courses [Intro]", "Loose", "Last"]);
    });

    it("never drops a group inside another one", () => {
        // Up over a folder of Series: before Series.
        expect(dragged("group:20", 3)).toEqual(["Loose", "Courses [Intro]", "Series [Dark, Wire]", "Last"]);
        // Down over Series' header: after Series.
        expect(
            dragged("group:20", "group:10", [library[0], library[2], library[1], library[3]] as LibraryEntry[])
        ).toEqual(["Loose", "Series [Dark, Wire]", "Courses [Intro]", "Last"]);
        expect(dragged("group:20", 1)).toEqual(["Courses [Intro]", "Loose", "Series [Dark, Wire]", "Last"]);
    });
});
