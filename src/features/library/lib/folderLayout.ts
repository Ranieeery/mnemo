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

export function isPinned(entry: LibraryEntry): boolean {
    return entry.kind === "folder" ? entry.folder.pinned : entry.group.pinned;
}

function partition<T>(items: readonly T[], pinned: (item: T) => boolean): T[] {
    return [...items.filter(pinned), ...items.filter((item) => !pinned(item))];
}

/**
 * The pinned items first in each list (the library's and each group's), each part in the order it had: where the
 * backend lists them, so a folder or a group dropped among the other part stays at the edge of its own.
 */
export function pinnedFirst(entries: readonly LibraryEntry[]): LibraryEntry[] {
    const inside = entries.map((entry) =>
        entry.kind === "group" ? { ...entry, folders: partition(entry.folders, (folder) => folder.pinned) } : entry
    );
    return partition(inside, isPinned);
}

/** Moves a folder to the end of a group, or with `null` to the end of the list (a pinned one, of the pinned ones). */
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
        return pinnedFirst([...rest, { kind: "folder", folder: { ...folder, groupId: null } }]);
    }
    return pinnedFirst(
        rest.map((entry) =>
            entry.kind === "group" && entry.group.id === groupId
                ? { ...entry, folders: [...entry.folders, { ...folder, groupId }] }
                : entry
        )
    );
}

/** A folder or a group of the library list. */
export type LibraryItem = { kind: "folder" | "group"; id: number };

/**
 * Whether the item `step` places away in the same list (its group's, or the library's) is on the other side of the
 * pinned items' edge, which moving never crosses: only pinning or unpinning does.
 */
export function atPinEdge(entries: readonly LibraryEntry[], item: LibraryItem, step: -1 | 1): boolean {
    const { pins, index } = pinsAround(entries, item);
    const [own, next] = [pins[index], pins[index + step]];
    return own !== undefined && next !== undefined && own !== next;
}

/** Whether each item of the list `item` is in is pinned, and its index there (-1 when it is not listed). */
function pinsAround(entries: readonly LibraryEntry[], item: LibraryItem): { pins: boolean[]; index: number } {
    if (item.kind === "folder") {
        for (const entry of entries) {
            const index = entry.kind === "group" ? entry.folders.findIndex((folder) => folder.id === item.id) : -1;
            if (entry.kind === "group" && index >= 0) {
                return { pins: entry.folders.map((folder) => folder.pinned), index };
            }
        }
    }
    const index = entries.findIndex(
        (entry) => entry.kind === item.kind && (entry.kind === "folder" ? entry.folder.id : entry.group.id) === item.id
    );
    return { pins: entries.map(isPinned), index };
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
 * place). Returns `null` at the edge, where it cannot move, and at the edge of the pinned items.
 */
export function stepFolder(entries: readonly LibraryEntry[], folderId: number, step: -1 | 1): LibraryEntry[] | null {
    const position = folderPosition(entries, folderId);
    if (
        !position ||
        position.index + step < 0 ||
        position.index + step >= position.count ||
        atPinEdge(entries, { kind: "folder", id: folderId }, step)
    ) {
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

/** Moves a group one place up or down in the list. Returns `null` at the edge, and at the edge of the pinned items. */
export function stepGroup(entries: readonly LibraryEntry[], groupId: number, step: -1 | 1): LibraryEntry[] | null {
    const index = entries.findIndex((entry) => entry.kind === "group" && entry.group.id === groupId);
    if (
        index < 0 ||
        index + step < 0 ||
        index + step >= entries.length ||
        atPinEdge(entries, { kind: "group", id: groupId }, step)
    ) {
        return null;
    }
    return swap(entries, index, step);
}
