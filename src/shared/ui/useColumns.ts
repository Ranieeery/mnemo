import { type RefObject, useLayoutEffect, useState } from "react";

/** How many items of at least `minItemWidth` fit in a row of `width`, with `gap` between them. Never less than 1. */
export function columnsFor(width: number, minItemWidth: number, gap: number): number {
    return Math.max(1, Math.floor((width + gap) / (minItemWidth + gap)));
}

/** Tracks the number of grid columns that fit in the element, updating when it resizes. */
export function useColumns(ref: RefObject<HTMLElement | null>, minItemWidth: number, gap: number): number {
    const [width, setWidth] = useState(0);

    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) {
            return;
        }
        setWidth(element.clientWidth);
        const observer = new ResizeObserver(([entry]) => {
            if (entry) {
                setWidth(entry.contentRect.width);
            }
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref]);

    return columnsFor(width, minItemWidth, gap);
}
