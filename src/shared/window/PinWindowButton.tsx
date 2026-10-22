import { Pin, PinOff } from "lucide-react";
import { useKeyboardShortcuts } from "../ipc/queries";
import { cx } from "../lib/cx";
import { shortcutHint } from "../lib/keyboard";
import { IconButton } from "../ui";
import { useWindowActions, useWindowMode } from "./windowMode";

/** Why pinning is unavailable, in its tooltip (Wayland lets no window keep itself on top). */
const UNSUPPORTED = "Keeping the window on top isn't supported on this system";

/** Keeps the whole window above other windows, in the top bar and the player. */
export function PinWindowButton({ variant = "ghost" }: { variant?: "ghost" | "overlay" }) {
    const { pinned, onTopSupported } = useWindowMode();
    const { togglePinned } = useWindowActions();
    const shortcuts = useKeyboardShortcuts();

    return (
        <IconButton
            label={onTopSupported ? "Pin window" : UNSUPPORTED}
            shortcut={onTopSupported ? shortcutHint(shortcuts.pinWindow) : undefined}
            icon={pinned ? <PinOff /> : <Pin />}
            variant={variant}
            pressed={onTopSupported ? pinned : undefined}
            disabled={!onTopSupported}
            className={cx(pinned && "bg-surface-hover/60")}
            onClick={() => void togglePinned()}
        />
    );
}
