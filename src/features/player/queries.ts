import { type QueryClient, useQuery } from "@tanstack/react-query";
import { commands, type Video } from "../../shared/ipc/bindings";
import { call } from "../../shared/ipc/client";
import { queryKeys } from "../../shared/ipc/queryKeys";
import { parseSubtitles } from "../../shared/lib/subtitles";
import { replaceVideo } from "../../shared/video";

/** The library record of the video, or `null` when it was not processed yet (it still plays, without progress). */
export function useVideoRecord(path: string) {
    return useQuery({ queryKey: queryKeys.video(path), queryFn: () => call(commands.getVideo(path)) });
}

/** The videos that play in sequence around this one, in the order "Up next" shows. */
export function usePlaylist(path: string) {
    return useQuery({ queryKey: queryKeys.playlist(path), queryFn: () => call(commands.listPlaylist(path)) });
}

/** Cues of the external subtitle next to the video; empty when there is none. */
export function useSubtitleCues(path: string) {
    return useQuery({
        queryKey: queryKeys.subtitle(path),
        queryFn: async () => {
            const file = await call(commands.findSubtitle(path));
            return file ? parseSubtitles(file.format, file.content) : [];
        },
        staleTime: Number.POSITIVE_INFINITY,
    });
}

/**
 * Persists the playback position and puts the updated video in every cached view. A plain function (not a mutation
 * hook) because the last save happens while the player unmounts.
 */
export async function saveProgress(
    queryClient: QueryClient,
    video: Video,
    positionSeconds: number,
    finished: boolean
): Promise<Video> {
    const updated = await call(commands.saveProgress(video.id, positionSeconds, finished));
    queryClient.setQueriesData({ queryKey: queryKeys.library }, (data: unknown) =>
        data === undefined ? data : replaceVideo(data, updated)
    );
    if (updated.isWatched !== video.isWatched) {
        // Becoming watched moves the video between home sections and changes folder progress.
        await queryClient.invalidateQueries({ queryKey: queryKeys.library });
    }
    return updated;
}
