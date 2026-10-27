import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useMediaQuery } from "../../shared/ui";

/** Below this window width the sidebar is a rail whatever was saved, so a half-screen window keeps its room. */
const NARROW_WINDOW = "(max-width: 999.98px)";

/**
 * In a narrow window, expanding the sidebar opens it over the screen (a drawer) without changing the saved layout.
 * It belongs to the screen it was opened on: going to another one closes it, and so does widening the window.
 */
export function useSidebarDrawer() {
    const narrow = useMediaQuery(NARROW_WINDOW);
    const href = useRouterState({ select: (state) => state.location.href });
    const [openOn, setOpenOn] = useState<string | null>(null);
    if (!narrow && openOn !== null) {
        setOpenOn(null);
    }
    return {
        narrow,
        open: narrow && openOn === href,
        setOpen: (open: boolean) => setOpenOn(open ? href : null),
    };
}

export type SidebarDrawer = ReturnType<typeof useSidebarDrawer>;
