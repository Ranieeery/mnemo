import { useQuery } from "@tanstack/react-query";
import { commands } from "./bindings";
import { call } from "./client";
import { queryKeys } from "./queryKeys";

/** Queries several features read: the library folders and whether ffmpeg/ffprobe are available. */

export function useLibraryFolders() {
    return useQuery({
        queryKey: queryKeys.libraryFolders(),
        queryFn: () => call(commands.listLibraryFolders()),
    });
}

export function useMediaTools() {
    return useQuery({
        queryKey: queryKeys.mediaTools(),
        queryFn: () => commands.mediaToolsStatus(),
        staleTime: Number.POSITIVE_INFINITY,
    });
}
