import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { commands, type Video, type VideoEntry } from "../ipc/bindings";
import { call, errorMessage } from "../ipc/client";
import { queryKeys } from "../ipc/queryKeys";
import { formatDuration } from "../lib/formatDuration";
import { toast } from "../ui";
import { replaceVideo } from "./replaceVideo";

/**
 * Marks a video as watched or unwatched. Every cached view updates immediately and rolls back if the backend
 * rejects the change.
 */
export function useSetWatched() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ video, watched }: { video: Video; watched: boolean }) =>
            call(commands.setWatched(video.id, watched)),
        onMutate: async ({ video, watched }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.library });
            const snapshot = queryClient.getQueriesData({ queryKey: queryKeys.library });
            const optimistic: Video = {
                ...video,
                isWatched: watched,
                watchProgressSeconds: watched ? video.durationSeconds : 0,
            };
            queryClient.setQueriesData({ queryKey: queryKeys.library }, (data: unknown) =>
                data === undefined ? data : replaceVideo(data, optimistic)
            );
            return { snapshot };
        },
        onError: (error, _variables, context) => {
            for (const [key, data] of context?.snapshot ?? []) {
                queryClient.setQueryData(key, data);
            }
            toast({ title: "Could not update the video", description: errorMessage(error), tone: "danger" });
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.library }),
    });
}

/**
 * Makes a frame of the video its thumbnail (`positionSeconds`), or restores the automatic one (`null`). ffmpeg
 * extracts the frame, so the new image shows up once the backend answers, in every cached view.
 */
export function useSetVideoThumbnail() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ video, positionSeconds }: { video: Video; positionSeconds: number | null }) =>
            call(commands.setVideoThumbnail(video.id, positionSeconds)),
        onSuccess: async (updated, { positionSeconds }) => {
            queryClient.setQueriesData({ queryKey: queryKeys.library }, (data: unknown) =>
                data === undefined ? data : replaceVideo(data, updated)
            );
            toast(
                positionSeconds === null
                    ? { title: "Restored the automatic thumbnail", tone: "success" }
                    : {
                          title: "Thumbnail updated",
                          description: `Frame at ${formatDuration(positionSeconds)}`,
                          tone: "success",
                      }
            );
            await queryClient.invalidateQueries({ queryKey: queryKeys.library });
        },
        onError: (error) => {
            toast({ title: "Could not change the thumbnail", description: errorMessage(error), tone: "danger" });
        },
    });
}

async function runSystemAction(action: Promise<unknown>, failureTitle: string) {
    try {
        await action;
    } catch (error) {
        toast({ title: failureTitle, description: errorMessage(error), tone: "danger" });
    }
}

export function openInDefaultPlayer(path: string) {
    return runSystemAction(call(commands.openExternally(path)), "Could not open the file");
}

export function showInFileManager(path: string) {
    return runSystemAction(call(commands.revealInFileManager(path)), "Could not show the file");
}

/** Opens a video in the built-in player. */
export function usePlayVideo() {
    const navigate = useNavigate();
    return useCallback(
        (entry: Pick<VideoEntry, "path">) => navigate({ to: "/watch", search: { path: entry.path } }),
        [navigate]
    );
}
