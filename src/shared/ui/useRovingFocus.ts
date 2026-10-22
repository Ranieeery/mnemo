import { type KeyboardEvent, useRef } from "react";

type RovingFocusOptions = {
    count: number;
    /** The item in the tab order, where the keys move from. */
    activeIndex: number;
    /** Makes `index` the active item (a radio group also chooses it). Focus follows on its own. */
    onMove: (index: number) => void;
    /** Items per row of a grid: Up and Down then move a row, and Home and End stay in the row. */
    columns?: number;
};

/** What each item spreads on its element: only the active item is a tab stop. */
export type RovingItemProps = {
    tabIndex: number;
    ref: (element: HTMLElement | null) => (() => void) | undefined;
};

/**
 * One tab stop for a group of items (radio group, grid of choices, chart columns): the arrows move between items,
 * Home and End jump to the ends. In a list every arrow moves to the previous or next item, wrapping around; in a grid
 * Left and Right do that, while Up and Down move a row and stop at the edges.
 *
 * Items may render later than the key that moved to them (a virtualized row): they take focus when they mount.
 */
export function useRovingFocus({ count, activeIndex, onMove, columns = 1 }: RovingFocusOptions) {
    const elements = useRef(new Map<number, HTMLElement>());
    const pendingFocus = useRef<number | null>(null);

    const onKeyDown = (event: KeyboardEvent) => {
        const target = nextIndex(event.key, activeIndex, count, columns);
        if (target === null) {
            return;
        }
        event.preventDefault();
        // The arrows belong to the group, not to shortcuts around it.
        event.stopPropagation();
        onMove(target);
        const element = elements.current.get(target);
        if (element) {
            element.focus();
        } else {
            pendingFocus.current = target;
        }
    };

    const itemProps = (index: number): RovingItemProps => ({
        tabIndex: index === activeIndex ? 0 : -1,
        ref: (element) => {
            if (!element) {
                return undefined;
            }
            elements.current.set(index, element);
            if (pendingFocus.current === index) {
                pendingFocus.current = null;
                element.focus();
            }
            return () => {
                if (elements.current.get(index) === element) {
                    elements.current.delete(index);
                }
            };
        },
    });

    return { onKeyDown, itemProps };
}

/** Where `key` moves from `index`, or `null` when it is not a key of the group (or there is nothing to move to). */
function nextIndex(key: string, index: number, count: number, columns: number): number | null {
    if (count === 0) {
        return null;
    }
    const last = count - 1;
    const step = (delta: number) => (index + delta + count) % count;
    // A list is a single row.
    const rowStart = columns === 1 ? 0 : index - (index % columns);
    const rowEnd = columns === 1 ? last : Math.min(rowStart + columns - 1, last);
    switch (key) {
        case "ArrowRight":
            return step(1);
        case "ArrowLeft":
            return step(-1);
        case "ArrowDown":
            return columns === 1 ? step(1) : index + columns <= last ? index + columns : null;
        case "ArrowUp":
            return columns === 1 ? step(-1) : index - columns >= 0 ? index - columns : null;
        case "Home":
            return rowStart;
        case "End":
            return rowEnd;
        default:
            return null;
    }
}
