import type { FolderContents, LibraryEntry, LibraryFolder, LibraryGroup, Video, VideoEntry } from "../ipc/bindings";

/** Test data builder for a processed video. */
export function videoFixture(overrides: Partial<Video> = {}): Video {
    const id = overrides.id ?? 1;
    return {
        id,
        filePath: `D:\\Videos\\Show\\Episode ${id}.mkv`,
        title: `Episode ${id}`,
        description: "",
        durationSeconds: 1500,
        thumbnailPath: null,
        isWatched: false,
        watchProgressSeconds: 0,
        lastWatchedAt: null,
        createdAt: "2025-01-01 10:00:00",
        updatedAt: "2025-01-01 10:00:00",
        ...overrides,
    };
}

/** A library folder; without a custom name, `name` and `folderName` agree like the backend's. */
export function libraryFolderFixture(overrides: Partial<LibraryFolder> = {}): LibraryFolder {
    const folderName = overrides.folderName ?? overrides.name ?? "Videos";
    const customName = overrides.customName ?? null;
    return {
        id: 1,
        path: "D:\\Videos",
        name: customName ?? folderName,
        folderName,
        customName,
        groupId: null,
        customIcon: null,
        iconColor: null,
        createdAt: null,
        ...overrides,
    };
}

export function libraryGroupFixture(overrides: Partial<LibraryGroup> = {}): LibraryGroup {
    return { id: 10, name: "Series", collapsed: false, createdAt: "2025-01-01 10:00:00", ...overrides };
}

/**
 * The library as the sidebar lists it, from `folders` in list order: folders without a group stay where they are and
 * each group, listed in `groups`, takes the place of its first folder (or goes last when it has none).
 */
export function libraryLayoutFixture(folders: LibraryFolder[], groups: LibraryGroup[] = []): LibraryEntry[] {
    const entries: LibraryEntry[] = [];
    for (const folder of folders) {
        const group = groups.find((candidate) => candidate.id === folder.groupId);
        const listed = entries.find((entry) => entry.kind === "group" && entry.group.id === group?.id);
        if (!group) {
            entries.push({ kind: "folder", folder });
        } else if (listed?.kind === "group") {
            listed.folders.push(folder);
        } else {
            entries.push({ kind: "group", group, folders: [folder] });
        }
    }
    for (const group of groups) {
        if (!entries.some((entry) => entry.kind === "group" && entry.group.id === group.id)) {
            entries.push({ kind: "group", group, folders: [] });
        }
    }
    return entries;
}

/** For `mockCommands`: the library folders (in list order), listed flat and as the sidebar lists them. */
export function libraryCommandsFixture(folders: LibraryFolder[], groups: LibraryGroup[] = []) {
    return { list_library_folders: folders, get_library_layout: libraryLayoutFixture(folders, groups) };
}

export function entryFixture(video: Video): VideoEntry {
    return { path: video.filePath, name: video.filePath.split("\\").at(-1) ?? video.filePath, video };
}

export function folderContentsFixture(overrides: Partial<FolderContents> = {}): FolderContents {
    return {
        path: "D:\\Videos\\Show",
        viewMode: { mode: "folders", definedAt: null },
        subfolders: [],
        groups: [],
        otherFiles: [],
        ...overrides,
    };
}
