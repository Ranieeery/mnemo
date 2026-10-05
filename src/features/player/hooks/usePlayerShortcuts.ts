import { useEffect, useRef } from "react";
import { commandForKey, type PlayerCommand } from "../lib/shortcuts";

function isEditable(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
    );
}

/** A dialog or menu owns the keyboard while it is open (Escape closes it, not the player). */
function overlayIsOpen(): boolean {
    return document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
}

/** Player keyboard shortcuts on the whole window. `onCommand` may change between renders. */
export function usePlayerShortcuts(onCommand: (command: PlayerCommand) => void) {
    const handler = useRef(onCommand);
    handler.current = onCommand;

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || isEditable(event.target) || overlayIsOpen()) {
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
            const command = commandForKey(event);
            if (command) {
                event.preventDefault();
                handler.current(command);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);
}
