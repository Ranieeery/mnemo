import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commands, type FolderViewMode } from "../../shared/ipc/bindings";
import { call, errorMessage } from "../../shared/ipc/client";
import { queryKeys } from "../../shared/ipc/queryKeys";
import { toast } from "../../shared/ui";

export function useFolderContents(path: string) {
    return useQuery({
        queryKey: queryKeys.folder(path),
        queryFn: () => call(commands.browseFolder(path)),
    });
}

/** Counts used by the folder header and to enable the folder actions. */
export function useFolderSummary(path: string, enabled = true) {
    return useQuery({
        queryKey: queryKeys.folderSummary(path),
        queryFn: () => call(commands.getFolderSummary(path)),
        enabled,
    });
}

/** Shared settings of the folder mutations: refresh every view, report failures. */
function useLibraryMutation<Variables, Result>(
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
        onError: (error) => {
            toast({ title: failureTitle, description: errorMessage(error), tone: "danger" });
        },
    });
}

export function useSetViewMode() {
    return useLibraryMutation(
        ({ path, mode }: { path: string; mode: FolderViewMode | null }) => call(commands.setFolderViewMode(path, mode)),
        "Could not change the view"
    );
}

export function useSetFolderWatched() {
    return useLibraryMutation(
        ({ path, watched }: { path: string; watched: boolean }) => call(commands.setFolderWatched(path, watched)),
        "Could not update the videos",
        (changed, { watched }) =>
            toast({
                title: `Marked ${changed} ${changed === 1 ? "video" : "videos"} as ${watched ? "watched" : "unwatched"}`,
                tone: "success",
            })
    );
}

export function useAddTagToFolder() {
    return useLibraryMutation(
        ({ path, name }: { path: string; name: string }) => call(commands.addTagToFolder(path, name)),
        "Could not add the tag",
        (tagged, { name }) =>
            toast({
                title: `Tagged ${tagged} ${tagged === 1 ? "video" : "videos"} with "${name.trim().toLowerCase()}"`,
                tone: "success",
            })
    );
}

export function useRemoveFolderTags() {
    return useLibraryMutation(
        ({ path }: { path: string }) => call(commands.removeAllTagsFromFolder(path)),
        "Could not remove the tags",
        (removed) => toast({ title: `Removed ${removed} ${removed === 1 ? "tag" : "tags"}`, tone: "success" })
    );
}
