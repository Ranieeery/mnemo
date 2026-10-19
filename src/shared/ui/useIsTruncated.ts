import { type RefObject, useLayoutEffect, useState } from "react";

/**
 * Whether the element's text is cut off (by `truncate` or `line-clamp-*`). Measured again whenever the element
 * resizes, for example when a panel around it is dragged, and when `text` changes.
 */
export function useIsTruncated(ref: RefObject<HTMLElement | null>, text: string): boolean {
    const [truncated, setTruncated] = useState(false);

    // biome-ignore lint/correctness/useExhaustiveDependencies: a new text needs a new measurement.
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) {
            return;
        }
        const measure = () =>
            setTruncated(element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref, text]);

    return truncated;
}
