import type { LayoutEntry, LibraryEntry, LibraryFolder, LibraryGroup } from "../../../shared/ipc/bindings";

/** Every folder in list order: a group's folders where the group is. */
export function flatFolders(entries: readonly LibraryEntry[]): LibraryFolder[] {
    return entries.flatMap((entry) => (entry.kind === "folder" ? [entry.folder] : entry.folders));
}

export function groupsOf(entries: readonly LibraryEntry[]): LibraryGroup[] {
    return entries.flatMap((entry) => (entry.kind === "group" ? [entry.group] : []));
}

/** What is sent to store an arrangement: the items of the list by id, each group with its folders. */
export function layoutOf(entries: readonly LibraryEntry[]): LayoutEntry[] {
    return entries.map((entry) =>
        entry.kind === "folder"
            ? { kind: "folder", id: entry.folder.id }
            : { kind: "group", id: entry.group.id, folders: entry.folders.map((folder) => folder.id) }
    );
}

/** Whether two arrangements differ in the order of their items or in the groups of their folders. */
export function arrangementChanged(before: readonly LibraryEntry[], after: readonly LibraryEntry[]): boolean {
    return JSON.stringify(layoutOf(before)) !== JSON.stringify(layoutOf(after));
}

/** A key telling the items of the list apart (a folder and a group may share an id). */
export function entryKey(entry: LibraryEntry): string {
    return entry.kind === "folder" ? `folder:${entry.folder.id}` : `group:${entry.group.id}`;
}

/** Changes every folder with `update`, wherever it is listed. */
export function mapFolders(
    entries: readonly LibraryEntry[],
    update: (folder: LibraryFolder) => LibraryFolder
): LibraryEntry[] {
    return entries.map((entry) =>
        entry.kind === "folder"
            ? { ...entry, folder: update(entry.folder) }
            : { ...entry, folders: entry.folders.map(update) }
    );
}

export function mapGroup(
    entries: readonly LibraryEntry[],
    groupId: number,
    update: (group: LibraryGroup) => LibraryGroup
): LibraryEntry[] {
    return entries.map((entry) =>
        entry.kind === "group" && entry.group.id === groupId ? { ...entry, group: update(entry.group) } : entry
    );
}

/** Where a folder is: its group (`null` for none), its index there and how many share that list. */
export function folderPosition(
    entries: readonly LibraryEntry[],
    folderId: number
): { group: LibraryGroup | null; index: number; count: number } | null {
    const index = entries.findIndex((entry) => entry.kind === "folder" && entry.folder.id === folderId);
    if (index >= 0) {
        return { group: null, index, count: entries.length };
    }
    for (const entry of entries) {
        const inside = entry.kind === "group" ? entry.folders.findIndex((folder) => folder.id === folderId) : -1;
        if (entry.kind === "group" && inside >= 0) {
            return { group: entry.group, index: inside, count: entry.folders.length };
        }
    }
    return null;
}

/** Takes a folder out of wherever it is listed. */
function withoutFolder(entries: readonly LibraryEntry[], folderId: number): LibraryEntry[] {
    return entries.flatMap((entry): LibraryEntry[] => {
        if (entry.kind === "folder") {
            return entry.folder.id === folderId ? [] : [entry];
        }
        return [{ ...entry, folders: entry.folders.filter((folder) => folder.id !== folderId) }];
    });
}

/** Moves a folder to the end of a group, or with `null` to the end of the list. */
export function moveToGroup(
    entries: readonly LibraryEntry[],
    folderId: number,
    groupId: number | null
): LibraryEntry[] {
    const folder = flatFolders(entries).find((candidate) => candidate.id === folderId);
    if (!folder || (groupId !== null && !groupsOf(entries).some((group) => group.id === groupId))) {
        return [...entries];
    }
    const rest = withoutFolder(entries, folderId);
    if (groupId === null) {
        return [...rest, { kind: "folder", folder: { ...folder, groupId: null } }];
    }
    return rest.map((entry) =>
        entry.kind === "group" && entry.group.id === groupId
            ? { ...entry, folders: [...entry.folders, { ...folder, groupId }] }
            : entry
    );
}

function swap<T>(items: readonly T[], index: number, step: -1 | 1): T[] {
    const moved = [...items];
    const [a, b] = [moved[index], moved[index + step]];
    if (a !== undefined && b !== undefined) {
        moved[index] = b;
        moved[index + step] = a;
    }
    return moved;
}

/**
 * Moves a folder one place up or down within its list (its group, or the list itself, where a group counts as one
 * place). Returns `null` at the edge, where it cannot move.
 */
export function stepFolder(entries: readonly LibraryEntry[], folderId: number, step: -1 | 1): LibraryEntry[] | null {
    const position = folderPosition(entries, folderId);
    if (!position || position.index + step < 0 || position.index + step >= position.count) {
        return null;
    }
    if (!position.group) {
        return swap(entries, position.index, step);
    }
    const groupId = position.group.id;
    return entries.map((entry) =>
        entry.kind === "group" && entry.group.id === groupId
            ? { ...entry, folders: swap(entry.folders, position.index, step) }
            : entry
    );
}

/** Moves a group one place up or down in the list. Returns `null` at the edge. */
export function stepGroup(entries: readonly LibraryEntry[], groupId: number, step: -1 | 1): LibraryEntry[] | null {
    const index = entries.findIndex((entry) => entry.kind === "group" && entry.group.id === groupId);
    if (index < 0 || index + step < 0 || index + step >= entries.length) {
        return null;
    }
    return swap(entries, index, step);
}
