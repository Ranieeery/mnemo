import type { RouterHistory } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useKeyboardShortcuts } from "../../shared/ipc/queries";
import { comboFromEvent, hasCommandModifier, isTextEntry } from "../../shared/lib/keyboard";

/** Mouse buttons 3 and 4 are the side "back" and "forward" buttons. */
const MOUSE_BACK = 3;
const MOUSE_FORWARD = 4;

function currentIndex(history: RouterHistory): number {
    return history.location.state.__TSR_index ?? 0;
}

/**
 * Browser-style back/forward for the app. The furthest index reached is tracked because the history API cannot tell
 * whether a forward entry exists.
 */
export function useHistoryNavigation() {
    const { history } = useRouter();
    const [position, setPosition] = useState(() => ({ index: currentIndex(history), furthest: currentIndex(history) }));

    useEffect(
        () =>
            history.subscribe(({ action }) => {
                setPosition((previous) => {
                    const index = currentIndex(history);
                    // A new entry drops everything that was ahead of it.
                    const furthest = action.type === "PUSH" ? index : Math.max(previous.furthest, index);
                    return { index, furthest };
                });
            }),
        [history]
    );

    const canGoBack = position.index > 0;
    const canGoForward = position.index < position.furthest;
    const back = useCallback(() => canGoBack && history.back(), [canGoBack, history]);
    const forward = useCallback(() => canGoForward && history.forward(), [canGoForward, history]);

    return { canGoBack, canGoForward, back, forward };
}

/**
 * The configured back/forward keys (Alt+←/→ by default) and the mouse side buttons for every screen, including the
 * player (where "back" closes it and "forward" reopens the last video). Mount once, at the root.
 */
export function useHistoryShortcuts() {
    const { back, forward } = useHistoryNavigation();
    const { historyBack, historyForward } = useKeyboardShortcuts();

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const combo = comboFromEvent(event);
            // A plain key typed in a field is text, not navigation.
            if (combo === null || (isTextEntry(event.target) && !hasCommandModifier(combo))) {
                return;
            }
            if (historyBack.includes(combo)) {
                event.preventDefault();
                back();
            } else if (historyForward.includes(combo)) {
                event.preventDefault();
                forward();
            }
        };
        // The webview would also navigate on its own for the side buttons; cancel that and act once, on release.
        const cancelSideButton = (event: MouseEvent) => {
            if (event.button === MOUSE_BACK || event.button === MOUSE_FORWARD) {
                event.preventDefault();
            }
        };
        const handleMouseUp = (event: MouseEvent) => {
            cancelSideButton(event);
            if (event.button === MOUSE_BACK) {
                back();
            } else if (event.button === MOUSE_FORWARD) {
                forward();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("mousedown", cancelSideButton);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("mousedown", cancelSideButton);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [back, forward, historyBack, historyForward]);
}
