import type { Video } from "../ipc/bindings";

function isVideo(value: object): value is Video {
    return "id" in value && "filePath" in value && "isWatched" in value && "watchProgressSeconds" in value;
}

/**
 * Returns `data` with every copy of the video `updated.id` replaced, whatever the shape of the cached query (lists,
 * home sections, folder groups, search entries). Untouched branches keep their identity so React can skip them.
 */
export function replaceVideo<T>(data: T, updated: Video): T {
    return replaceIn(data, updated) as T;
}

function replaceIn(value: unknown, updated: Video): unknown {
    if (Array.isArray(value)) {
        let changed = false;
        const next = value.map((item) => {
            const replaced = replaceIn(item, updated);
            changed ||= replaced !== item;
            return replaced;
        });
        return changed ? next : value;
    }
    if (value === null || typeof value !== "object") {
        return value;
    }
    if (isVideo(value)) {
        return value.id === updated.id ? updated : value;
    }
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value)) {
        const replaced = replaceIn(field, updated);
        changed ||= replaced !== field;
        next[key] = replaced;
    }
    return changed ? next : value;
}
