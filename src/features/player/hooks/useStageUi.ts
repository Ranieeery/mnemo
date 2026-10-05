import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

/** Controls hide after this long without activity while playing. */
const HIDE_CONTROLS_AFTER_MS = 3000;
/** How long the center feedback (seek amount, volume, speed) stays on screen. */
const FLASH_MS = 700;

/** Shows the controls on activity and hides them while the video plays undisturbed. Paused video keeps them. */
export function useAutoHide(playing: boolean) {
    const [visible, setVisible] = useState(true);
    const timer = useRef<number | undefined>(undefined);
    const playingRef = useRef(playing);
    playingRef.current = playing;

    const reveal = useCallback(() => {
        setVisible(true);
        window.clearTimeout(timer.current);
        if (playingRef.current) {
            timer.current = window.setTimeout(() => setVisible(false), HIDE_CONTROLS_AFTER_MS);
        }
    }, []);

    useEffect(() => {
        if (playing) {
            reveal();
        } else {
            window.clearTimeout(timer.current);
            setVisible(true);
        }
        return () => window.clearTimeout(timer.current);
    }, [playing, reveal]);

    return { visible, reveal };
}

export type Flash = { id: number; label: string };

/** A short message in the middle of the video confirming what a key did ("+10s", "Volume 40%", "1.5×"). */
export function useFlash() {
    const [flash, setFlash] = useState<Flash | null>(null);
    const timer = useRef<number | undefined>(undefined);

    const show = useCallback((label: string) => {
        window.clearTimeout(timer.current);
        setFlash((previous) => ({ id: (previous?.id ?? 0) + 1, label }));
        timer.current = window.setTimeout(() => setFlash(null), FLASH_MS);
    }, []);

    useEffect(() => () => window.clearTimeout(timer.current), []);
    return { flash, show };
}

/** Full screen for the given element (the video and its controls), tracking changes made with Esc or the system. */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const sync = () =>
            setIsFullscreen(document.fullscreenElement !== null && document.fullscreenElement === ref.current);
        document.addEventListener("fullscreenchange", sync);
        return () => document.removeEventListener("fullscreenchange", sync);
    }, [ref]);

    const toggle = useCallback(() => {
        if (document.fullscreenElement) {
            void document.exitFullscreen();
        } else {
            void ref.current?.requestFullscreen?.();
        }
    }, [ref]);

    return { isFullscreen, toggle };
}
