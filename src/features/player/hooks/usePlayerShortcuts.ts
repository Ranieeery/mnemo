import { useEffect, useRef } from "react";
import { useKeyboardShortcuts } from "../../../shared/ipc/queries";
import { isTextEntry } from "../../../shared/lib/keyboard";
import { commandForKey, type PlayerCommand } from "../lib/shortcuts";

/** A dialog or menu owns the keyboard while it is open (Escape closes it, not the player). */
function overlayIsOpen(): boolean {
    return document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
}

/** Player keyboard shortcuts on the whole window. `onCommand` may change between renders. */
export function usePlayerShortcuts(onCommand: (command: PlayerCommand) => void) {
    const handler = useRef(onCommand);
    handler.current = onCommand;
    const shortcuts = useRef(useKeyboardShortcuts());
    shortcuts.current = useKeyboardShortcuts();

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || isTextEntry(event.target) || overlayIsOpen()) {
                return;
            }
            // A focused slider (seek, volume) handles its own arrow keys.
            if (
                event.key.startsWith("Arrow") &&
                event.target instanceof Element &&
                event.target.closest('[role="slider"]')
            ) {
                return;
            }
            const command = commandForKey(event, shortcuts.current);
            if (command) {
                event.preventDefault();
                handler.current(command);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);
}
