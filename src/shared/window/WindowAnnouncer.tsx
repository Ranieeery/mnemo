import { useEffect, useRef, useState } from "react";
import type { WindowMode } from "../ipc/bindings";
import { useWindowMode } from "./windowMode";

/** What changed between two modes, as a screen reader should hear it. */
export function modeChange(before: WindowMode, after: WindowMode): string | null {
    if (before.mini !== after.mini) {
        return after.mini ? "Mini player on" : "Mini player off";
    }
    if (before.pinned !== after.pinned) {
        return after.pinned ? "Window pinned on top" : "Window unpinned";
    }
    return null;
}

/**
 * Announces the window's mode changes, however they happen: a button, a key or the window itself (maximizing the mini
 * player). Mount once, at the root.
 */
export function WindowAnnouncer() {
    const mode = useWindowMode();
    const previous = useRef(mode);
    const [message, setMessage] = useState<{ id: number; text: string } | null>(null);

    useEffect(() => {
        const text = modeChange(previous.current, mode);
        previous.current = mode;
        if (text) {
            setMessage((last) => ({ id: (last?.id ?? 0) + 1, text }));
        }
    }, [mode]);

    return (
        <p role="status" className="sr-only">
            {/* A new node per change, so the same text twice is announced twice. */}
            {message && <span key={message.id}>{message.text}</span>}
        </p>
    );
}
