import { QueryClientProvider } from "@tanstack/react-query";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { followUpdates } from "../features/settings";
import { followLibrary } from "../shared/ipc/followLibrary";
import { useKeyboardShortcuts } from "../shared/ipc/queries";
import { queryClient } from "../shared/ipc/queryClient";
import { comboFromEvent, hasCommandModifier, isOverlayOpen, isTextEntry } from "../shared/lib/keyboard";
import { openShortcutsHelp } from "../shared/stores/dialogs";
import { followProcessing } from "../shared/stores/processing";
import { Toaster, TooltipProvider } from "../shared/ui";
import { followWindowMode, useWindowActions, useWindowMode, WindowAnnouncer } from "../shared/window";
import { DialogHost } from "./DialogHost";
import { useHistoryShortcuts } from "./navigation/useHistoryNavigation";

export function RootLayout() {
    return (
        <QueryClientProvider client={queryClient}>
            <TooltipProvider delayDuration={400} skipDelayDuration={200}>
                <GlobalShortcuts />
                <MiniPlayerOnlyInThePlayer />
                <WindowAnnouncer />
                <NoBrowserContextMenu />
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
    usePinWindowShortcut();
    // Background jobs, changes on disk, the window's modes and newer releases report here, whatever screen is open.
    useEffect(() => followProcessing(), []);
    useEffect(() => followLibrary(), []);
    useEffect(() => followUpdates(), []);
    useEffect(() => followWindowMode(queryClient), []);

    // "?" shows every shortcut, except while typing (where it is just a character) or over another dialog.
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (
                event.defaultPrevented ||
                comboFromEvent(event) !== "?" ||
                isTextEntry(event.target) ||
                isOverlayOpen()
            ) {
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

/**
 * The configured "Pin window" keys, on every screen: not while typing (unless with Ctrl, Alt or Meta), over a dialog
 * or menu, or in the mini player, which is always on top.
 */
function usePinWindowShortcut() {
    const { pinWindow } = useKeyboardShortcuts();
    const { mini, onTopSupported } = useWindowMode();
    const { togglePinned } = useWindowActions();

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const combo = comboFromEvent(event);
            if (
                combo === null ||
                !pinWindow.includes(combo) ||
                (isTextEntry(event.target) && !hasCommandModifier(combo)) ||
                isOverlayOpen()
            ) {
                return;
            }
            event.preventDefault();
            if (!mini && onTopSupported) {
                void togglePinned();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [pinWindow, mini, onTopSupported, togglePinned]);
}

/**
 * The mini player only lasts while a video is open: leaving the player in any way (closing it, the back button or
 * key, the mouse's back button) gives the window back its size. Also covers a reload in the mini player.
 */
function MiniPlayerOnlyInThePlayer() {
    const { mini } = useWindowMode();
    const { exitMini } = useWindowActions();
    const pathname = useRouterState({ select: (state) => state.location.pathname });
    const inPlayer = pathname === "/watch";

    useEffect(() => {
        if (mini && !inPlayer) {
            void exitMini();
        }
    }, [mini, inPlayer, exitMini]);

    return null;
}

/**
 * Right-click shows the app's own menus (videos, folders) and never the webview's (Back, Reload, Inspect), which
 * would break out of the app. Text fields keep it for cut, copy and paste.
 */
function NoBrowserContextMenu() {
    useEffect(() => {
        const handleContextMenu = (event: MouseEvent) => {
            if (!isTextEntry(event.target)) {
                event.preventDefault();
            }
        };
        window.addEventListener("contextmenu", handleContextMenu);
        return () => window.removeEventListener("contextmenu", handleContextMenu);
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
