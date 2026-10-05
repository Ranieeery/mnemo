import { type RefObject, useCallback, useEffect, useState } from "react";

export type PlaybackState = {
    playing: boolean;
    currentTime: number;
    duration: number;
};

const MEDIA_EVENTS = ["play", "pause", "timeupdate", "durationchange", "loadedmetadata", "seeked", "ended"] as const;

/** Mirrors the state of a `<video>` element and offers the basic controls. */
export function usePlayback(videoRef: RefObject<HTMLVideoElement | null>) {
    const [state, setState] = useState<PlaybackState>({ playing: false, currentTime: 0, duration: 0 });

    useEffect(() => {
        const element = videoRef.current;
        if (!element) {
            return;
        }
        const sync = () =>
            setState({
                playing: !element.paused,
                currentTime: element.currentTime,
                duration: Number.isFinite(element.duration) ? element.duration : 0,
            });
        for (const event of MEDIA_EVENTS) {
            element.addEventListener(event, sync);
        }
        sync();
        return () => {
            for (const event of MEDIA_EVENTS) {
                element.removeEventListener(event, sync);
            }
        };
    }, [videoRef]);

    const togglePlay = useCallback(() => {
        const element = videoRef.current;
        if (!element) {
            return;
        }
        if (element.paused) {
            // Rejected when the source cannot play; the element's error state covers that.
            element.play().catch(() => undefined);
        } else {
            element.pause();
        }
    }, [videoRef]);

    const seekTo = useCallback(
        (seconds: number) => {
            const element = videoRef.current;
            if (!element) {
                return;
            }
            const end = Number.isFinite(element.duration) ? element.duration : Number.POSITIVE_INFINITY;
            element.currentTime = Math.min(end, Math.max(0, seconds));
        },
        [videoRef]
    );

    const seekBy = useCallback(
        (seconds: number) => seekTo((videoRef.current?.currentTime ?? 0) + seconds),
        [seekTo, videoRef]
    );

    return { ...state, togglePlay, seekTo, seekBy };
}
