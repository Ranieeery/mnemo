import type { FolderContents, LibraryFolder, Video, VideoEntry } from "../ipc/bindings";

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
        customIcon: null,
        iconColor: null,
        createdAt: null,
        ...overrides,
    };
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
