import { arrayMove } from "@dnd-kit/sortable";
import type { LibraryEntry, LibraryFolder, LibraryGroup } from "../../../shared/ipc/bindings";
import { entryKey } from "./folderLayout";

/**
 * The library as one list of rows, for dragging: a folder, a group's header, and the end of a group. A folder
 * belongs to the group whose header comes before it, until that group's end, so where a folder is dropped tells
 * whether it goes in a group or out of it. Drag and drop ids: a folder's numeric id, `group:<id>` and `end:<id>`.
 */
export type LibraryRow =
    | { kind: "folder"; id: number; folder: LibraryFolder }
    | { kind: "group"; id: string; group: LibraryGroup; folders: LibraryFolder[]; expanded: boolean }
    | { kind: "end"; id: string };

export function groupRowId(groupId: number): string {
    return `group:${groupId}`;
}

export function endRowId(groupId: number): string {
    return `end:${groupId}`;
}

type RowOptions = {
    /** Its folders and its end are listed; otherwise only its header. */
    expanded: (group: LibraryGroup) => boolean;
    /** Leaves empty groups out (the rail shows no group without folders). */
    skipEmptyGroups?: boolean;
};

export function libraryRows(entries: readonly LibraryEntry[], { expanded, skipEmptyGroups }: RowOptions): LibraryRow[] {
    return entries.flatMap((entry): LibraryRow[] => {
        if (entry.kind === "folder") {
            return [{ kind: "folder", id: entry.folder.id, folder: entry.folder }];
        }
        const { group, folders } = entry;
        if (skipEmptyGroups && folders.length === 0) {
            return [];
        }
        const header: LibraryRow = {
            kind: "group",
            id: groupRowId(group.id),
            group,
            folders,
            expanded: expanded(group),
        };
        if (!header.expanded) {
            return [header];
        }
        return [
            header,
            ...folders.map((folder): LibraryRow => ({ kind: "folder", id: folder.id, folder })),
            { kind: "end", id: endRowId(group.id) },
        ];
    });
}

/**
 * The library the rows stand for, each folder in the group it is listed in. A group shown without its folders keeps
 * them, and a group left out of the rows goes back after the item it followed in `before`.
 */
export function entriesOf(rows: readonly LibraryRow[], before: readonly LibraryEntry[]): LibraryEntry[] {
    const entries: LibraryEntry[] = [];
    let open: Extract<LibraryEntry, { kind: "group" }> | null = null;
    for (const row of rows) {
        if (row.kind === "group") {
            const entry: LibraryEntry = { kind: "group", group: row.group, folders: row.expanded ? [] : row.folders };
            entries.push(entry);
            open = row.expanded ? entry : null;
        } else if (row.kind === "end") {
            open = null;
        } else if (open) {
            open.folders.push({ ...row.folder, groupId: open.group.id });
        } else {
            entries.push({ kind: "folder", folder: { ...row.folder, groupId: null } });
        }
    }
    before.forEach((entry, index) => {
        if (entry.kind === "group" && !entries.some((candidate) => entryKey(candidate) === entryKey(entry))) {
            const previous = before[index - 1];
            const at = previous ? entries.findIndex((candidate) => entryKey(candidate) === entryKey(previous)) + 1 : 0;
            entries.splice(at, 0, entry);
        }
    });
    return entries;
}

/** The expanded group whose header comes before `index`, until its end: the group a row there belongs to. */
function openGroupAt(rows: readonly LibraryRow[], index: number): number | null {
    for (let at = index - 1; at >= 0; at--) {
        const row = rows[at];
        if (row?.kind === "end") {
            return null;
        }
        if (row?.kind === "group") {
            return row.expanded ? at : null;
        }
    }
    return null;
}

/**
 * Moves the row `activeId` to where `overId` is, as sorting a list does (after it when moving down, before it when
 * moving up). A group never lands inside another one: it goes past that group, before or after it.
 */
export function moveRow(rows: readonly LibraryRow[], activeId: string | number, overId: string | number): LibraryRow[] {
    const from = rows.findIndex((row) => row.id === activeId);
    const to = rows.findIndex((row) => row.id === overId);
    const active = rows[from];
    if (!active || to < 0 || from === to) {
        return [...rows];
    }
    const moved = arrayMove([...rows], from, to);
    const header = active.kind === "group" ? openGroupAt(moved, to) : null;
    if (header === null) {
        return moved;
    }
    moved.splice(to, 1);
    if (to < from) {
        moved.splice(header, 0, active);
    } else {
        const end = moved.findIndex((row, index) => index > header && row.kind === "end");
        moved.splice(end + 1, 0, active);
    }
    return moved;
}
