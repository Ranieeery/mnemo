import type { RouterHistory } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { HiddenFolder } from "../../shared/ipc/bindings";
import { useHiddenFolders, useKeyboardShortcuts } from "../../shared/ipc/queries";
import { comboFromEvent, hasCommandModifier, isOverlayOpen, isTextEntry } from "../../shared/lib/keyboard";
import { isWithin } from "../../shared/lib/paths";
import { nearestHiddenFolder } from "../../shared/video";

/** Mouse buttons 3 and 4 are the side "back" and "forward" buttons. */
const MOUSE_BACK = 3;
const MOUSE_FORWARD = 4;

type Entry = { pathname: string; search: string };
/** The entries seen so far (the history API cannot list them) and the current one. */
type Position = { index: number; entries: readonly (Entry | undefined)[] };

function currentIndex(history: RouterHistory): number {
    return history.location.state.__TSR_index ?? 0;
}

function entryOf(history: RouterHistory): Entry {
    return { pathname: history.location.pathname, search: history.location.search };
}

type Tracker = { subscribe: (listener: () => void) => () => void; position: () => Position };
const trackers = new WeakMap<RouterHistory, Tracker>();

/**
 * Follows the entries of a history for as long as the app runs, shared by every screen (the top bar unmounts in the
 * player, but its buttons must still know what lies behind and ahead).
 */
function trackerOf(history: RouterHistory): Tracker {
    const existing = trackers.get(history);
    if (existing) {
        return existing;
    }
    const index = currentIndex(history);
    const entries: (Entry | undefined)[] = [];
    entries[index] = entryOf(history);
    let position: Position = { index, entries };
    const listeners = new Set<() => void>();
    history.subscribe(({ action }) => {
        const index = currentIndex(history);
        // A new entry drops everything that was ahead of it.
        const entries = action.type === "PUSH" ? position.entries.slice(0, index) : [...position.entries];
        entries[index] = entryOf(history);
        position = { index, entries };
        for (const listener of listeners) {
            listener();
        }
    });
    const tracker: Tracker = {
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        position: () => position,
    };
    trackers.set(history, tracker);
    return tracker;
}

/** A screen showing a path: the folder being browsed or the video being played. */
export type Place = { route: "folder" | "watch"; path: string };

/**
 * Whether going to `target` from `current` would open a video of a hidden folder from outside it. A hidden video
 * only plays when reached from its folder, so history never reopens it from the home page or elsewhere.
 */
export function isConcealed(target: Place | null, current: Place | null, hidden: readonly HiddenFolder[]): boolean {
    if (target?.route !== "watch") {
        return false;
    }
    const folder = nearestHiddenFolder(target.path, hidden);
    return folder !== undefined && !(current && isWithin(current.path, folder.path));
}

/**
 * Browser-style back/forward for the app. Entries that would open a video of a hidden folder from outside it are
 * skipped, and a direction with nothing else left is disabled.
 */
export function useHistoryNavigation() {
    const router = useRouter();
    const { history } = router;
    const tracker = trackerOf(history);
    const { index, entries } = useSyncExternalStore(tracker.subscribe, tracker.position);
    const hidden = useHiddenFolders().data ?? [];

    const placeOf = (entry: Entry | undefined): Place | null => {
        const route = entry?.pathname.slice(1);
        if (!entry || (route !== "folder" && route !== "watch")) {
            return null;
        }
        const { path }: { path?: unknown } = router.options.parseSearch(entry.search);
        return typeof path === "string" ? { route, path } : null;
    };
    const current = placeOf(entries[index]);
    const nearestAllowed = (step: -1 | 1) => {
        for (let target = index + step; target >= 0 && target < entries.length; target += step) {
            if (!isConcealed(placeOf(entries[target]), current, hidden)) {
                return target;
            }
        }
        return undefined;
    };
    const backTarget = nearestAllowed(-1);
    const forwardTarget = nearestAllowed(1);

    const canGoBack = backTarget !== undefined;
    const canGoForward = forwardTarget !== undefined;
    const back = useCallback(
        () => backTarget !== undefined && history.go(backTarget - index),
        [backTarget, history, index]
    );
    const forward = useCallback(
        () => forwardTarget !== undefined && history.go(forwardTarget - index),
        [forwardTarget, history, index]
    );

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
            // A plain key typed in a field is text, not navigation; an open dialog or menu stays over its screen.
            if (combo === null || (isTextEntry(event.target) && !hasCommandModifier(combo)) || isOverlayOpen()) {
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
            if (isOverlayOpen()) {
                return;
            }
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
