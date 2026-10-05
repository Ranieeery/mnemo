import { useQuery } from "@tanstack/react-query";
import { Channel } from "@tauri-apps/api/core";
import { useState } from "react";
import { commands, type SearchProgress } from "../../shared/ipc/bindings";
import { call } from "../../shared/ipc/client";
import { queryKeys } from "../../shared/ipc/queryKeys";

/** Library search results are capped; refining the query is the way to narrow them further. */
export const LIBRARY_SEARCH_LIMIT = 300;

export function useLibrarySearch(query: string) {
    return useQuery({
        queryKey: queryKeys.librarySearch(query),
        queryFn: () => call(commands.searchLibrary(query, LIBRARY_SEARCH_LIMIT)),
        enabled: query.trim().length > 0,
    });
}

/**
 * Searches file names on disk below `path`, including videos not processed yet, and reports how far the scan got.
 * A newer search makes the backend abandon this one.
 */
export function useFolderSearch(path: string, query: string) {
    const [progress, setProgress] = useState<SearchProgress | null>(null);
    const search = useQuery({
        queryKey: queryKeys.folderSearch(path, query),
        queryFn: () => {
            setProgress(null);
            return call(commands.searchFolder(path, query, new Channel<SearchProgress>(setProgress)));
        },
        enabled: query.trim().length > 0,
        // The disk can change between searches; always scan again.
        staleTime: 0,
    });
    return { search, progress };
}
