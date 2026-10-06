/** Search params of the screens, validated because the URL can contain anything. */

import { isStatusFilter, isVideoSort, type StatusFilter, type VideoSort } from "../../features/browser";
import { isSettingsTab, type SettingsTab } from "../../features/settings";

type HomeSearch = { q?: string };
/** `sort` and `status` are left out while they hold their defaults, to keep the URL short. */
type FolderSearch = { path: string; q?: string; sort?: VideoSort; status?: StatusFilter };
type WatchSearch = { path: string };
type SettingsSearch = { tab?: SettingsTab };

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
    return {
        path: requiredPath(search.path),
        ...optionalQuery(search.q),
        ...(isVideoSort(search.sort) ? { sort: search.sort } : {}),
        ...(isStatusFilter(search.status) ? { status: search.status } : {}),
    };
}

export function validateWatchSearch(search: Record<string, unknown>): WatchSearch {
    return { path: requiredPath(search.path) };
}

export function validateSettingsSearch(search: Record<string, unknown>): SettingsSearch {
    return isSettingsTab(search.tab) ? { tab: search.tab } : {};
}
