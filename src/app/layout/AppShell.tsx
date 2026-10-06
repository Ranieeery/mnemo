import { Outlet, useRouterState, useSearch } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { MediaToolsNotice, ProcessingBar } from "../../features/library";
import { ScrollContainer, ScrollToTopButton } from "../../shared/ui";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

/** Layout of the new interface: sidebar, top bar, status banners and the scrolling screen. */
export function AppShell() {
    return (
        <div className="flex h-screen bg-background text-text">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
                <TopBar />
                <MediaToolsNotice />
                <ProcessingBar />
                <ScrollContainer className="flex-1">
                    <ScrollToTopOnNavigation />
                    <main className="animate-appear">
                        <Outlet />
                    </main>
                    <ScrollToTopButton />
                </ScrollContainer>
            </div>
        </div>
    );
}

/** A new screen starts at the top; the scroll container itself persists between routes. */
function ScrollToTopOnNavigation() {
    const anchorRef = useRef<HTMLSpanElement>(null);
    const pathname = useRouterState({ select: (state) => state.location.pathname });
    const screenKey = `${pathname}|${useSearch({ strict: false }).path ?? ""}`;
    const lastScreenKey = useRef(screenKey);

    useEffect(() => {
        if (lastScreenKey.current !== screenKey) {
            lastScreenKey.current = screenKey;
            anchorRef.current?.parentElement?.scrollTo({ top: 0 });
        }
    }, [screenKey]);

    return <span ref={anchorRef} hidden />;
}
