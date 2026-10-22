import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { commands, events, type WindowMode } from "../ipc/bindings";
import { call, errorMessage } from "../ipc/client";
import { queryKeys } from "../ipc/queryKeys";
import { toast } from "../ui/Toast";

/** How every session starts: a normal window, not pinned. */
const STARTING_MODE: WindowMode = { pinned: false, mini: false, onTopSupported: true };

/** The window's modes, owned by the backend; the starting mode applies until they load or if they cannot. */
export function useWindowMode(): WindowMode {
    const query = useQuery({
        queryKey: queryKeys.windowMode(),
        queryFn: () => call(commands.getWindowMode()),
        staleTime: Number.POSITIVE_INFINITY,
    });
    return query.data ?? STARTING_MODE;
}

/**
 * Follows the modes the backend changes on its own (maximizing the mini player expands it) as well as through
 * commands. Call once at the app root; returns the cleanup.
 */
export function followWindowMode(queryClient: QueryClient): () => void {
    let active = true;
    const subscription = events.windowModeChanged.listen(({ payload }) =>
        queryClient.setQueryData(queryKeys.windowMode(), payload)
    );
    return () => {
        if (active) {
            active = false;
            void subscription.then((unlisten) => unlisten());
        }
    };
}

/** A video's size in pixels, for the mini player's aspect ratio; zeros when unknown. */
export type VideoSize = { width: number; height: number };

/** What changes the window's modes; each change shows at once and failures are reported. */
export function useWindowActions() {
    const queryClient = useQueryClient();
    return useMemo(() => windowActions(queryClient), [queryClient]);
}

function windowActions(queryClient: QueryClient) {
    const current = () => queryClient.getQueryData<WindowMode>(queryKeys.windowMode()) ?? STARTING_MODE;
    const show = (mode: WindowMode) => queryClient.setQueryData(queryKeys.windowMode(), mode);

    /** Keeps the window on top of other windows, or stops; put back if the system refuses. */
    const setPinned = async (pinned: boolean) => {
        const previous = current();
        show({ ...previous, pinned });
        try {
            show(await call(commands.setWindowPinned(pinned)));
        } catch (error) {
            show(previous);
            toast({
                title: pinned ? "Could not pin the window" : "Could not unpin the window",
                description: errorMessage(error),
                tone: "danger",
            });
        }
    };

    return {
        setPinned,
        togglePinned: () => setPinned(!current().pinned),
        /** Turns the window into the mini player for a video of this size. */
        enterMini: async (size: VideoSize) => {
            try {
                show(await call(commands.enterMiniPlayer(size.width, size.height)));
            } catch (error) {
                toast({ title: "Could not open the mini player", description: errorMessage(error), tone: "danger" });
            }
        },
        /** Gives the window back the size and state it had before the mini player; false when it failed. */
        exitMini: async (): Promise<boolean> => {
            try {
                show(await call(commands.exitMiniPlayer()));
                return true;
            } catch (error) {
                toast({ title: "Could not restore the window", description: errorMessage(error), tone: "danger" });
                return false;
            }
        },
        /** Fits the mini player to the video now playing (the next video may have another shape). */
        fitMini: async (size: VideoSize) => {
            if (!current().mini) {
                return;
            }
            try {
                await call(commands.setMiniPlayerAspect(size.width, size.height));
            } catch (error) {
                toast({
                    title: "Could not fit the mini player to this video",
                    description: errorMessage(error),
                    tone: "danger",
                });
            }
        },
    };
}
