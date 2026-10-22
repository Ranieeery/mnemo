import { useEffect, useRef } from "react";
import { useKeyboardShortcuts } from "../../../shared/ipc/queries";
import { isOverlayOpen, isTextEntry } from "../../../shared/lib/keyboard";
import { commandForKey, type PlayerCommand } from "../lib/shortcuts";

/** Player keyboard shortcuts on the whole window. `onCommand` may change between renders. */
export function usePlayerShortcuts(onCommand: (command: PlayerCommand) => void) {
    const handler = useRef(onCommand);
    handler.current = onCommand;
    const keys = useKeyboardShortcuts();
    const shortcuts = useRef(keys);
    shortcuts.current = keys;

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || isTextEntry(event.target) || isOverlayOpen()) {
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
