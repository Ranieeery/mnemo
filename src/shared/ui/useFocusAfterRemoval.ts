import { useEffect, useRef } from "react";

type Target = () => HTMLElement | null | undefined;

type Pending = { from: Element | null; target: Target };

/**
 * Keeps keyboard focus from falling to the page when the focused control goes away (a removed tag, a deleted row).
 * Call the returned function when that control acts. Once it has left the page, focus moves to what `target` returns
 * (as soon as it returns an element), unless the user already took focus somewhere else. While a dialog the control opened has focus, it waits: the
 * dialog gives focus back on closing, and the control may be gone by then.
 */
export function useFocusAfterRemoval() {
    const pending = useRef<Pending | null>(null);

    // Every render: the control usually leaves in a later render than the one that started its action.
    useEffect(() => {
        const current = pending.current;
        if (!current || current.from?.isConnected) {
            return;
        }
        const focused = document.activeElement;
        if (focused === null || focused === document.body) {
            // The target may come in a later render (an item being added): wait for it.
            const target = current.target();
            if (target) {
                pending.current = null;
                target.focus();
            }
        } else if (!focused.closest("[role=dialog], [role=alertdialog]")) {
            pending.current = null;
        }
    });

    return (target: Target) => {
        pending.current = { from: document.activeElement, target };
    };
}

/** The element at `index`, or the last one when the list got shorter: the neighbor of a removed item. */
export function elementNear<T extends Element>(elements: ArrayLike<T> | undefined, index: number): T | undefined {
    if (!elements || elements.length === 0) {
        return undefined;
    }
    return elements[Math.min(index, elements.length - 1)];
}
