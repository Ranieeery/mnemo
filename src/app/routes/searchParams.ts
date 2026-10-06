/** Search params of the screens, validated because the URL can contain anything. */

type HomeSearch = { q?: string };
type FolderSearch = { path: string; q?: string };
type WatchSearch = { path: string };

function optionalQuery(value: unknown): { q?: string } {
    return typeof value === "string" && value.trim() ? { q: value } : {};
}

function requiredPath(value: unknown): string {
    return typeof value === "string" ? value : "";
}

export function validateHomeSearch(search: Record<string, unknown>): HomeSearch {
    return optionalQuery(search.q);
}

export function validateFolderSearch(search: Record<string, unknown>): FolderSearch {
    return { path: requiredPath(search.path), ...optionalQuery(search.q) };
}

export function validateWatchSearch(search: Record<string, unknown>): WatchSearch {
    return { path: requiredPath(search.path) };
}
