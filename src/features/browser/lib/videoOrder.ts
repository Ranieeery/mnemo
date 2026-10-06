import type { VideoEntry, VideoGroup } from "../../../shared/ipc/bindings";

/** What the folder sorts its videos by. "added" is when the video joined the library. */
export const SORT_FIELDS = ["name", "duration", "added"] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export type SortDirection = "asc" | "desc";

/** A field and a direction, as kept in the URL: "duration-desc". */
export type VideoSort = `${SortField}-${SortDirection}`;
const VIDEO_SORTS: readonly VideoSort[] = SORT_FIELDS.flatMap((field) => [`${field}-asc`, `${field}-desc`] as const);
export const DEFAULT_SORT: VideoSort = "name-asc";

export function sortField(sort: VideoSort): SortField {
    return sort.startsWith("duration") ? "duration" : sort.startsWith("added") ? "added" : "name";
}

export function sortDirection(sort: VideoSort): SortDirection {
    return sort.endsWith("desc") ? "desc" : "asc";
}

/** Choosing a field sorts ascending; choosing the current field again flips the direction. */
export function nextSort(current: VideoSort, field: SortField): VideoSort {
    const direction = sortField(current) === field && sortDirection(current) === "asc" ? "desc" : "asc";
    return `${field}-${direction}`;
}

export const STATUS_FILTERS = ["all", "unwatched", "in-progress", "watched"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** The order and filter of a folder's videos. Neither changes the playlist, which follows the folder. */
export type VideoOrder = { sort: VideoSort; status: StatusFilter };
export const DEFAULT_ORDER: VideoOrder = { sort: DEFAULT_SORT, status: "all" };

export function isVideoSort(value: unknown): value is VideoSort {
    return VIDEO_SORTS.some((sort) => sort === value);
}

export function isStatusFilter(value: unknown): value is StatusFilter {
    return STATUS_FILTERS.some((status) => status === value);
}

/** Watched, started but not finished, or neither. Videos not read yet count as unwatched. */
export function matchesStatus(entry: VideoEntry, status: StatusFilter): boolean {
    const { video } = entry;
    switch (status) {
        case "all":
            return true;
        case "watched":
            return video?.isWatched === true;
        case "in-progress":
            return video !== null && !video.isWatched && video.watchProgressSeconds > 0;
        case "unwatched":
            return video === null || (!video.isWatched && video.watchProgressSeconds === 0);
    }
}

type SortKey = (entry: VideoEntry) => number | string | null;

const sortKeys: Record<"duration" | "added", SortKey> = {
    duration: (entry) => entry.video?.durationSeconds ?? null,
    added: (entry) => entry.video?.createdAt ?? null,
};

/**
 * Sorts entries that arrive in natural name order (the backend's). Names keep that order, or reverse it; other
 * fields fall back to it on ties. Videos not read yet have no duration or date, so they always go last.
 */
export function sortEntries(entries: readonly VideoEntry[], sort: VideoSort): VideoEntry[] {
    const field = sortField(sort);
    const direction = sortDirection(sort);
    if (field !== "duration" && field !== "added") {
        return direction === "desc" ? [...entries].reverse() : [...entries];
    }
    const key = sortKeys[field];
    const sign = direction === "desc" ? -1 : 1;
    // Array.prototype.sort is stable, so ties keep the natural order.
    return [...entries].sort((a, b) => {
        const first = key(a);
        const second = key(b);
        if (first === null || second === null) {
            return first === second ? 0 : first === null ? 1 : -1;
        }
        return first < second ? -sign : first > second ? sign : 0;
    });
}

/** Sorts and filters every group; with a filter on, groups left without videos are dropped. */
export function applyOrder(groups: readonly VideoGroup[], order: VideoOrder): VideoGroup[] {
    const ordered = groups.map((group) => ({
        ...group,
        entries: sortEntries(
            group.entries.filter((entry) => matchesStatus(entry, order.status)),
            order.sort
        ),
    }));
    return order.status === "all" ? ordered : ordered.filter((group) => group.entries.length > 0);
}
