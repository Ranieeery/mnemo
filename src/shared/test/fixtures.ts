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

export function libraryFolderFixture(overrides: Partial<LibraryFolder> = {}): LibraryFolder {
    return { id: 1, path: "D:\\Videos", name: "Videos", customIcon: null, createdAt: null, ...overrides };
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
