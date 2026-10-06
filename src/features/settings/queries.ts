import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type AppSettings, commands, type HomeData, type SubtitleStyle } from "../../shared/ipc/bindings";
import { call, errorMessage } from "../../shared/ipc/client";
import { queryKeys } from "../../shared/ipc/queryKeys";
import { toast } from "../../shared/ui";

export function useLibraryStats() {
    return useQuery({ queryKey: queryKeys.libraryStats(), queryFn: () => call(commands.getLibraryStats()) });
}

export function useAppSettings() {
    return useQuery({ queryKey: queryKeys.settings(), queryFn: () => call(commands.getSettings()) });
}

export function useDatabaseInfo() {
    return useQuery({ queryKey: queryKeys.databaseInfo(), queryFn: () => call(commands.getDatabaseInfo()) });
}

export function useOrphanedVideos() {
    return useQuery({ queryKey: queryKeys.orphanedVideos(), queryFn: () => call(commands.listOrphanedVideos()) });
}

/** Settings, library and maintenance actions: refresh everything they may affect and report failures. */
function useSettingsMutation<Variables, Result>(
    mutationFn: (variables: Variables) => Promise<Result>,
    failureTitle: string,
    onSuccess: (result: Result) => void
) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: async (result) => {
            await queryClient.invalidateQueries();
            onSuccess(result);
        },
        onError: (error) => toast({ title: failureTitle, description: errorMessage(error), tone: "danger" }),
    });
}

export function useUpdateSettings() {
    return useSettingsMutation(
        (settings: AppSettings) => call(commands.updateSettings(settings)),
        "Could not save the setting",
        () => toast({ title: "Setting saved", tone: "success" })
    );
}

export function useResetWatchStatus() {
    return useSettingsMutation(
        () => call(commands.resetAllWatchStatus()),
        "Could not reset the watch status",
        (count) =>
            toast({
                title: `Cleared the watch status of ${count} videos`,
                description: "Tags were kept.",
                tone: "success",
            })
    );
}

export function useExportLibrary() {
    return useSettingsMutation(
        (path: string) => call(commands.exportLibrary(path)).then(() => path),
        "Could not export the library",
        (path) => toast({ title: "Library exported", description: path, tone: "success" })
    );
}

export function useImportLibrary() {
    return useSettingsMutation(
        (path: string) => call(commands.importLibrary(path)),
        "Could not import the library",
        (summary) =>
            toast({
                title: "Library imported",
                description: `${summary.folders} folders, ${summary.videos} videos and ${summary.tags} tags.`,
                tone: "success",
            })
    );
}

export function useCleanOrphanedVideos() {
    return useSettingsMutation(
        () => call(commands.cleanOrphanedVideos()),
        "Could not clean up",
        (count) => toast({ title: `Removed ${count} orphaned videos`, tone: "success" })
    );
}

/**
 * Saves how subtitles look. The player and the preview change at once (the shared query is updated first) and go
 * back if the backend refuses the style.
 */
export function useSaveSubtitleStyle() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (style: SubtitleStyle) => call(commands.updateSubtitleStyle(style)),
        onMutate: async (style) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.subtitleStyle() });
            const previous = queryClient.getQueryData<SubtitleStyle>(queryKeys.subtitleStyle());
            queryClient.setQueryData(queryKeys.subtitleStyle(), style);
            return { previous };
        },
        onSuccess: (saved) => queryClient.setQueryData(queryKeys.subtitleStyle(), saved),
        onError: (error, _style, context) => {
            queryClient.setQueryData(queryKeys.subtitleStyle(), context?.previous);
            toast({ title: "Could not save the subtitle style", description: errorMessage(error), tone: "danger" });
        },
    });
}

/** A few videos are enough to find one with a thumbnail. */
const SAMPLE_FRAME_LIMIT = 4;

function firstThumbnail(home: HomeData): string | null {
    const videos = [
        ...home.continueWatching,
        ...home.recentlyWatched,
        ...home.suggestions,
        ...home.folderPreviews.flatMap((preview) => preview.videos),
    ];
    return videos.find((video) => video.thumbnailPath !== null)?.thumbnailPath ?? null;
}

/** A thumbnail from the library to preview subtitles over real footage; `null` when there is none yet. */
export function useSampleFrame() {
    return useQuery({
        queryKey: queryKeys.home(SAMPLE_FRAME_LIMIT),
        queryFn: () => call(commands.getHome(SAMPLE_FRAME_LIMIT)),
        select: firstThumbnail,
    });
}
