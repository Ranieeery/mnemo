import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { commands, DEFAULT_SIDEBAR_PREFERENCES, type SidebarPreferences } from "../../shared/ipc/bindings";
import { call, errorMessage } from "../../shared/ipc/client";
import { queryKeys } from "../../shared/ipc/queryKeys";
import { debounce } from "../../shared/lib/debounce";
import { toast } from "../../shared/ui";

/** Dragging the edge saves once, this long after it stops. */
export const SIDEBAR_SAVE_DELAY_MS = 400;

async function save(preferences: SidebarPreferences) {
    try {
        await call(commands.updateSidebarPreferences(preferences));
    } catch (error) {
        toast({ title: "Could not save the sidebar layout", description: errorMessage(error), tone: "danger" });
    }
}

/**
 * The sidebar's width and collapsed state, saved between sessions. `preferences` is `null` until they load, so the
 * sidebar never shows expanded first and then collapses; if they cannot be read, the defaults apply. Changes show
 * at once (in the query cache) and are saved after a short pause; collapsing or expanding is saved right away.
 */
export function useSidebarPreferences() {
    const queryClient = useQueryClient();
    const saved = useQuery({
        queryKey: queryKeys.sidebarPreferences(),
        queryFn: () => call(commands.getSidebarPreferences()),
        staleTime: Number.POSITIVE_INFINITY,
    });
    const saver = useMemo(() => debounce(save, SIDEBAR_SAVE_DELAY_MS), []);

    useEffect(() => saver.flush, [saver]);

    useEffect(() => {
        if (saved.isError) {
            toast({
                title: "Could not load the sidebar layout",
                description: errorMessage(saved.error),
                tone: "danger",
            });
        }
    }, [saved.isError, saved.error]);

    const preferences = saved.data ?? (saved.isError ? DEFAULT_SIDEBAR_PREFERENCES : null);

    const change = (next: Partial<SidebarPreferences>) => {
        const updated = { ...(preferences ?? DEFAULT_SIDEBAR_PREFERENCES), ...next };
        queryClient.setQueryData(queryKeys.sidebarPreferences(), updated);
        saver.schedule(updated);
    };

    return {
        preferences,
        setWidth: (width: number) => change({ width }),
        resetWidth: () => change({ width: DEFAULT_SIDEBAR_PREFERENCES.width }),
        toggleCollapsed: () => {
            change({ collapsed: !preferences?.collapsed });
            saver.flush();
        },
    };
}
