import { Outlet, useRouterState } from "@tanstack/react-router";
import { type RefObject, useEffect, useRef } from "react";
import { MediaToolsNotice, ProcessingBar } from "../../features/library";
import { ScrollContainer, ScrollToTopButton } from "../../shared/ui";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useSidebarDrawer } from "./useSidebarDrawer";

/** Layout of the new interface: sidebar, top bar, status banners and the scrolling screen. */
export function AppShell() {
    const mainRef = useRef<HTMLElement>(null);
    useScreenChange(mainRef);
    const drawer = useSidebarDrawer();

    return (
        <div className="flex h-screen bg-background text-text">
            {/* Hidden until focused: the first Tab offers to jump past the sidebar and its folders. */}
            <button
                type="button"
                onClick={() => focusScreenHeading(mainRef.current)}
                className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-body focus:text-text focus:shadow-overlay"
            >
                Skip to content
            </button>
            <Sidebar drawer={drawer} />
            {/* Under the open drawer, the screen is out of reach of the keyboard and assistive technology. */}
            <div className="flex min-w-0 flex-1 flex-col" inert={drawer.open}>
                <TopBar />
                <MediaToolsNotice />
                <ProcessingBar />
                <ScrollContainer className="flex-1">
                    <main ref={mainRef} tabIndex={-1} className="animate-appear outline-none">
                        <Outlet />
                    </main>
                    <ScrollToTopButton />
                </ScrollContainer>
            </div>
        </div>
    );
}

/** Moves focus to the screen's title, read by screen readers as the name of the new screen. */
function focusScreenHeading(main: HTMLElement | null) {
    const heading = main?.querySelector("h1");
    if (heading) {
        heading.tabIndex = -1;
        heading.focus();
    } else {
        main?.focus();
    }
}

/**
 * A new screen starts at the top (the scroll container persists between routes) and, when focus was on the screen
 * left behind or got lost with it, focus moves to the new screen's title. Focus in the sidebar or the top bar stays
 * there, so a keyboard user can go on through the folders and `F2` still renames the folder just opened. The screen
 * counts once it has loaded (`resolvedLocation`), so a screen loaded on demand already shows its title.
 */
function useScreenChange(mainRef: RefObject<HTMLElement | null>) {
    const screenKey = useRouterState({
        select: (state) => {
            const location = state.resolvedLocation ?? state.location;
            return `${location.pathname}|${location.search.path ?? ""}`;
        },
    });
    const lastScreenKey = useRef(screenKey);

    useEffect(() => {
        if (lastScreenKey.current === screenKey) {
            return;
        }
        lastScreenKey.current = screenKey;
        const main = mainRef.current;
        main?.parentElement?.scrollTo({ top: 0 });
        const focused = document.activeElement;
        if (focused === null || focused === document.body || main?.contains(focused)) {
            focusScreenHeading(main);
        }
    }, [mainRef, screenKey]);
}
