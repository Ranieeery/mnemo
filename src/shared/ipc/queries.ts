import { useQuery } from "@tanstack/react-query";
import type { ShortcutKeys } from "../lib/keyboard";
import { isWithin } from "../lib/paths";
import {
    commands,
    DEFAULT_KEYBOARD_SHORTCUTS,
    DEFAULT_SUBTITLE_STYLE,
    type LibraryFolderStatus,
    type SubtitleStyle,
} from "./bindings";
import { call } from "./client";
import { queryKeys } from "./queryKeys";

/** Queries several features read: the library folders and whether ffmpeg/ffprobe are available. */

export function useLibraryFolders() {
    return useQuery({
        queryKey: queryKeys.libraryFolders(),
        queryFn: () => call(commands.listLibraryFolders()),
    });
}

/** Whether each library folder is reachable and how its changes are followed; refreshed by the backend's events. */
export function useLibraryFolderStatuses() {
    return useQuery({
        queryKey: queryKeys.libraryFolderStatuses(),
        queryFn: () => commands.getLibraryFolderStatuses(),
    });
}

/** The status of the library folder that contains `path`, once known. */
export function useLibraryFolderStatus(path: string): LibraryFolderStatus | undefined {
    return useLibraryFolderStatuses().data?.find((status) => isWithin(path, status.path));
}

export function useMediaTools() {
    return useQuery({
        queryKey: queryKeys.mediaTools(),
        queryFn: () => commands.mediaToolsStatus(),
        staleTime: Number.POSITIVE_INFINITY,
    });
}

/**
 * The configured keyboard shortcuts, read by the player, the navigation, Settings and the help. Until they load, or
 * if they cannot be read, the defaults apply, so keys always work.
 */
export function useKeyboardShortcuts(): ShortcutKeys {
    return useKeyboardShortcutsQuery().data ?? DEFAULT_KEYBOARD_SHORTCUTS;
}

/** The shortcuts query itself, for screens that show its loading and error states. */
export function useKeyboardShortcutsQuery() {
    return useQuery({
        queryKey: queryKeys.keyboardShortcuts(),
        queryFn: () => call(commands.getKeyboardShortcuts()),
        staleTime: Number.POSITIVE_INFINITY,
    });
}

/** How subtitles look, read by the player and Settings. The default look applies until it loads or if it cannot. */
export function useSubtitleStyle(): SubtitleStyle {
    return useSubtitleStyleQuery().data ?? DEFAULT_SUBTITLE_STYLE;
}

/** The subtitle style query itself, for screens that show its loading and error states. */
export function useSubtitleStyleQuery() {
    return useQuery({
        queryKey: queryKeys.subtitleStyle(),
        queryFn: () => call(commands.getSubtitleStyle()),
        staleTime: Number.POSITIVE_INFINITY,
    });
}
