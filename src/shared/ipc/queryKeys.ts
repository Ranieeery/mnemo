/**
 * Query keys for backend data, in one place so a mutation in one feature can refresh another feature's data.
 * Everything derived from the library lives under `library`, so `invalidateQueries({ queryKey: queryKeys.library })`
 * refreshes every view after a change.
 */
export const queryKeys = {
    library: ["library"] as const,
    libraryFolders: () => ["library", "folders"] as const,
    recentFolderIcons: () => ["library", "recent-folder-icons"] as const,
    home: (limit: number) => ["library", "home", limit] as const,
    folder: (path: string) => ["library", "folder", path] as const,
    folderSummary: (path: string) => ["library", "folder-summary", path] as const,
    librarySearch: (query: string) => ["library", "search", query] as const,
    folderSearch: (path: string, query: string) => ["library", "folder-search", path, query] as const,
    video: (path: string) => ["library", "video", path] as const,
    playlist: (path: string) => ["library", "playlist", path] as const,
    tags: () => ["library", "tags"] as const,
    videoTags: (videoId: number) => ["library", "video-tags", videoId] as const,
    libraryStats: () => ["library", "stats"] as const,
    watchHistory: () => ["library", "watch-history"] as const,
    watchTotals: (days: number) => ["library", "watch-totals", days] as const,
    orphanedVideos: () => ["library", "orphans"] as const,
    databaseInfo: () => ["library", "database-info"] as const,
    subtitle: (path: string) => ["subtitle", path] as const,
    mediaTracks: (path: string) => ["media-tracks", path] as const,
    embeddedSubtitle: (path: string, index: number) => ["embedded-subtitle", path, index] as const,
    settings: () => ["settings"] as const,
    playerPreferences: () => ["player-preferences"] as const,
    keyboardShortcuts: () => ["keyboard-shortcuts"] as const,
    subtitleStyle: () => ["subtitle-style"] as const,
    mediaTools: () => ["media-tools"] as const,
};
