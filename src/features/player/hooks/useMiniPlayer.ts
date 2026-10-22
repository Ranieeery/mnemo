import { type RefObject, useCallback } from "react";
import { useWindowActions, useWindowMode, type VideoSize } from "../../../shared/window";

/** The video's size in pixels; zeros before its metadata loads (the mini player then assumes 16:9). */
export function videoSizeOf(element: HTMLVideoElement | null): VideoSize {
    return { width: element?.videoWidth ?? 0, height: element?.videoHeight ?? 0 };
}

/**
 * The mini player for the video in `videoRef`: the window itself, shrunk and always on top. Full screen ends first,
 * since the window cannot be both.
 */
export function useMiniPlayer(videoRef: RefObject<HTMLVideoElement | null>) {
    const { mini, onTopSupported } = useWindowMode();
    const { enterMini, exitMini, fitMini } = useWindowActions();

    const enter = useCallback(async () => {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
        }
        await enterMini(videoSizeOf(videoRef.current));
    }, [videoRef, enterMini]);

    const toggle = useCallback(() => (mini ? exitMini() : enter()), [mini, enter, exitMini]);
    const fit = useCallback(() => fitMini(videoSizeOf(videoRef.current)), [videoRef, fitMini]);

    return { mini, available: onTopSupported, enter, exit: exitMini, toggle, fit };
}
