import { QueryClientProvider } from "@tanstack/react-query";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { queryClient } from "../shared/ipc/queryClient";
import { comboFromEvent, isTextEntry } from "../shared/lib/keyboard";
import { openShortcutsHelp } from "../shared/stores/dialogs";
import { followProcessing } from "../shared/stores/processing";
import { Toaster, TooltipProvider } from "../shared/ui";
import { DialogHost } from "./DialogHost";
import { useHistoryShortcuts } from "./navigation/useHistoryNavigation";

export function RootLayout() {
    return (
        <QueryClientProvider client={queryClient}>
            <TooltipProvider delayDuration={400} skipDelayDuration={200}>
                <GlobalShortcuts />
                <Outlet />
                <DialogHost />
                <Toaster />
                {import.meta.env.DEV && <DevCatalogShortcut />}
            </TooltipProvider>
        </QueryClientProvider>
    );
}

/** Keys that work on every screen. Inside the query provider: the keys are configurable and loaded from the backend. */
function GlobalShortcuts() {
    useHistoryShortcuts();
    // Background jobs report here, whatever screen is open.
    useEffect(() => followProcessing(), []);

    // "?" shows every shortcut, except while typing (where it is just a character) or over another dialog.
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || comboFromEvent(event) !== "?" || isTextEntry(event.target)) {
                return;
            }
            if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) {
                return;
            }
            event.preventDefault();
            openShortcutsHelp();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    return null;
}

/** Development only: Ctrl+Shift+D toggles the design system catalog, since the app window has no address bar. */
function DevCatalogShortcut() {
    const navigate = useNavigate();
    const pathname = useRouterState({ select: (state) => state.location.pathname });

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "d") {
                event.preventDefault();
                void navigate({ to: pathname === "/dev/catalog" ? "/" : "/dev/catalog" });
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [navigate, pathname]);

    return null;
}
