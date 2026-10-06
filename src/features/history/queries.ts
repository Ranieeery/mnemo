import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { commands, type HistoryCursor } from "../../shared/ipc/bindings";
import { call } from "../../shared/ipc/client";
import { queryKeys } from "../../shared/ipc/queryKeys";

/** Entries per page of the watch history. */
export const HISTORY_PAGE_SIZE = 50;

const FIRST_PAGE: HistoryCursor | null = null;

/** The watch history, newest first, one page at a time. */
export function useWatchHistory() {
    return useInfiniteQuery({
        queryKey: queryKeys.watchHistory(),
        queryFn: ({ pageParam }) => call(commands.listWatchHistory(pageParam, HISTORY_PAGE_SIZE)),
        initialPageParam: FIRST_PAGE,
        getNextPageParam: (page) => page.nextCursor,
    });
}

/** Watched time per day over the last `days` days. */
export function useWatchTotals(days: number) {
    return useQuery({
        queryKey: queryKeys.watchTotals(days),
        queryFn: () => call(commands.getWatchTotals(days)),
    });
}
