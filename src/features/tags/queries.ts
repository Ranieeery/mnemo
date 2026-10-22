import { useQuery } from "@tanstack/react-query";
import { commands } from "../../shared/ipc/bindings";
import { call } from "../../shared/ipc/client";
import { useLibraryMutation } from "../../shared/ipc/queries";
import { queryKeys } from "../../shared/ipc/queryKeys";
import { plural } from "../../shared/lib/plural";
import { toast } from "../../shared/ui";

export function useAllTags() {
    return useQuery({ queryKey: queryKeys.tags(), queryFn: () => call(commands.listTags()) });
}

export function useVideoTags(videoId: number) {
    return useQuery({ queryKey: queryKeys.videoTags(videoId), queryFn: () => call(commands.getVideoTags(videoId)) });
}

export function useCreateTag() {
    return useLibraryMutation(
        (name: string) => call(commands.createTag(name)),
        "Could not create the tag",
        (tag) => toast({ title: `Created tag “${tag.name}”`, tone: "success" })
    );
}

export function useAddTagToVideo(videoId: number) {
    return useLibraryMutation((name: string) => call(commands.addTagToVideo(videoId, name)), "Could not add the tag");
}

export function useRemoveTagFromVideo(videoId: number) {
    return useLibraryMutation(
        (tagId: number) => call(commands.removeTagFromVideo(videoId, tagId)),
        "Could not remove the tag"
    );
}

export function useDeleteTag() {
    return useLibraryMutation(
        ({ id }: { id: number; name: string }) => call(commands.deleteTag(id)),
        "Could not delete the tag",
        (_result, { name }) => toast({ title: `Deleted tag “${name}”`, tone: "success" })
    );
}

export function useRemoveTagFromAllVideos() {
    return useLibraryMutation(
        ({ id }: { id: number; name: string }) => call(commands.removeTagFromAllVideos(id)),
        "Could not remove the tag",
        (removed, { name }) => toast({ title: `Removed “${name}” from ${plural(removed, "video")}`, tone: "success" })
    );
}

export function useDeleteAllTags() {
    return useLibraryMutation(
        () => call(commands.deleteAllTags()),
        "Could not delete the tags",
        (deleted) => toast({ title: `Deleted ${plural(deleted, "tag")}`, tone: "success" })
    );
}

export function useDeleteUnusedTags() {
    return useLibraryMutation(
        () => call(commands.deleteUnusedTags()),
        "Could not clean up the tags",
        (deleted) =>
            toast({
                title: deleted > 0 ? `Deleted ${deleted} unused ${deleted === 1 ? "tag" : "tags"}` : "No unused tags",
                tone: "success",
            })
    );
}
