import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commands } from "../../shared/ipc/bindings";
import { call, errorMessage } from "../../shared/ipc/client";
import { queryKeys } from "../../shared/ipc/queryKeys";
import { toast } from "../../shared/ui";

export function useAllTags() {
    return useQuery({ queryKey: queryKeys.tags(), queryFn: () => call(commands.listTags()) });
}

export function useVideoTags(videoId: number) {
    return useQuery({ queryKey: queryKeys.videoTags(videoId), queryFn: () => call(commands.getVideoTags(videoId)) });
}

/** Tag changes affect searches and tag lists everywhere, so they refresh the whole library cache. */
function useTagMutation<Variables, Result>(
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

export function useCreateTag() {
    return useTagMutation(
        (name: string) => call(commands.createTag(name)),
        "Could not create the tag",
        (tag) => toast({ title: `Created tag "${tag.name}"`, tone: "success" })
    );
}

export function useAddTagToVideo(videoId: number) {
    return useTagMutation((name: string) => call(commands.addTagToVideo(videoId, name)), "Could not add the tag");
}

export function useRemoveTagFromVideo(videoId: number) {
    return useTagMutation(
        (tagId: number) => call(commands.removeTagFromVideo(videoId, tagId)),
        "Could not remove the tag"
    );
}

export function useDeleteTag() {
    return useTagMutation(
        ({ id }: { id: number; name: string }) => call(commands.deleteTag(id)),
        "Could not delete the tag",
        (_result, { name }) => toast({ title: `Deleted tag "${name}"`, tone: "success" })
    );
}

export function useRemoveTagFromAllVideos() {
    return useTagMutation(
        ({ id }: { id: number; name: string }) => call(commands.removeTagFromAllVideos(id)),
        "Could not remove the tag",
        (removed, { name }) =>
            toast({ title: `Removed "${name}" from ${removed} ${removed === 1 ? "video" : "videos"}`, tone: "success" })
    );
}

export function useDeleteAllTags() {
    return useTagMutation(
        () => call(commands.deleteAllTags()),
        "Could not delete the tags",
        (deleted) => toast({ title: `Deleted ${deleted} ${deleted === 1 ? "tag" : "tags"}`, tone: "success" })
    );
}

export function useDeleteUnusedTags() {
    return useTagMutation(
        () => call(commands.deleteUnusedTags()),
        "Could not clean up the tags",
        (deleted) =>
            toast({
                title: deleted > 0 ? `Deleted ${deleted} unused ${deleted === 1 ? "tag" : "tags"}` : "No unused tags",
                tone: "success",
            })
    );
}
