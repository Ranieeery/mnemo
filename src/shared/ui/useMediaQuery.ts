import { useCallback, useSyncExternalStore } from "react";

/** Whether the window matches a media query, e.g. `(max-width: 999.98px)`, following it as the window changes. */
export function useMediaQuery(query: string): boolean {
    const subscribe = useCallback(
        (onChange: () => void) => {
            const list = window.matchMedia(query);
            list.addEventListener("change", onChange);
            return () => list.removeEventListener("change", onChange);
        },
        [query]
    );
    return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
