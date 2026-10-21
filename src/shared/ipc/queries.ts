import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { folderName } from "../lib/folderName";
import type { ShortcutKeys } from "../lib/keyboard";
import { isWithin } from "../lib/paths";
import { toast } from "../ui/Toast";
import {
    commands,
    DEFAULT_KEYBOARD_SHORTCUTS,
    DEFAULT_SUBTITLE_STYLE,
    type LibraryFolderStatus,
    type SubtitleStyle,
} from "./bindings";
import { call, errorMessage } from "./client";
import { queryKeys } from "./queryKeys";

/** A change to library data: refreshes every view of the library and reports failures with `failureTitle`. */
export function useLibraryMutation<Variables, Result>(
    mutationFn: (variables: Variables) => Promise<Result>,
    failureTitle: string,
    onSuccess?: (result: Result, variables: Variables) => void
) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: async (result, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.library });
            onSuccess?.(result, variables);
        },
        onError: (error) => toast({ title: failureTitle, description: errorMessage(error), tone: "danger" }),
    });
}

/** Queries several features read: the library folders, the hidden ones and whether ffmpeg/ffprobe are available. */

export function useLibraryFolders() {
    return useQuery({
        queryKey: queryKeys.libraryFolders(),
        queryFn: () => call(commands.listLibraryFolders()),
    });
}

/** The library as the sidebar lists it: folders without a group and groups with their folders, in order. */
export function useLibraryLayout() {
    return useQuery({
        queryKey: queryKeys.libraryLayout(),
        queryFn: () => call(commands.getLibraryLayout()),
    });
}

/** The name the app shows for the folder at `path` (see `folderName`). */
export function useFolderName(path: string): string {
    return folderName(path, useLibraryFolders().data);
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

/** The folders hidden from the home page and the history. */
export function useHiddenFolders() {
    return useQuery({
        queryKey: queryKeys.hiddenFolders(),
        queryFn: () => call(commands.listHiddenFolders()),
    });
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
