import { type FocusEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";

/** Controls hide after this long without activity while playing. */
const HIDE_CONTROLS_AFTER_MS = 3000;
/** How long the center feedback (seek amount, volume, speed) stays on screen. */
const FLASH_MS = 700;

/**
 * Shows the controls on activity and hides them while the video plays undisturbed. Paused video keeps them, and so
 * does keyboard focus inside the stage: Tab would otherwise land on invisible buttons. The returned `focusHandlers`
 * go on the stage.
 */
export function useAutoHide(playing: boolean) {
    const [shown, setShown] = useState(true);
    // Only keyboard focus (`:focus-visible`) holds them: a clicked button keeps the focus, and must not.
    const [keyboardFocus, setKeyboardFocus] = useState(false);
    const timer = useRef<number | undefined>(undefined);
    const playingRef = useRef(playing);
    playingRef.current = playing;

    const reveal = useCallback(() => {
        setShown(true);
        window.clearTimeout(timer.current);
        if (playingRef.current) {
            timer.current = window.setTimeout(() => setShown(false), HIDE_CONTROLS_AFTER_MS);
        }
    }, []);

    useEffect(() => {
        if (playing) {
            reveal();
        } else {
            window.clearTimeout(timer.current);
            setShown(true);
        }
        return () => window.clearTimeout(timer.current);
    }, [playing, reveal]);

    const focusHandlers = {
        onFocus: (event: FocusEvent) => {
            if (event.target instanceof Element && event.target.matches(":focus-visible")) {
                setKeyboardFocus(true);
                reveal();
            }
        },
        onBlur: (event: FocusEvent) => {
            const next = event.relatedTarget;
            if (keyboardFocus && !(next instanceof Node && event.currentTarget.contains(next))) {
                setKeyboardFocus(false);
                // The usual delay starts once focus leaves, so the controls don't vanish under the eyes.
                reveal();
            }
        },
    };

    return { visible: shown || keyboardFocus || !playing, reveal, focusHandlers };
}

type Flash = { id: number; label: string };

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
