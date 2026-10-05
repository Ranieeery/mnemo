import { QueryClientProvider } from "@tanstack/react-query";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { queryClient } from "../shared/ipc/queryClient";
import { Toaster, TooltipProvider } from "../shared/ui";
import { DialogHost } from "./DialogHost";
import { useHistoryShortcuts } from "./navigation/useHistoryNavigation";

export function RootLayout() {
    useHistoryShortcuts();
    return (
        <QueryClientProvider client={queryClient}>
            <TooltipProvider delayDuration={400} skipDelayDuration={200}>
                <Outlet />
                <DialogHost />
                <Toaster />
                {import.meta.env.DEV && <DevCatalogShortcut />}
            </TooltipProvider>
        </QueryClientProvider>
    );
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
