import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster, TooltipProvider } from "../shared/ui";

export function RootLayout() {
    return (
        <TooltipProvider delayDuration={400} skipDelayDuration={200}>
            <Outlet />
            <Toaster />
            {import.meta.env.DEV && <DevCatalogShortcut />}
        </TooltipProvider>
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
