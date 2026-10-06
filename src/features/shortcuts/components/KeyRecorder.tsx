import { useEffect, useRef } from "react";
import { comboFromEvent } from "../../../shared/lib/keyboard";

type KeyRecorderProps = {
    /** What the key is for, for screen readers. */
    label: string;
    onRecord: (combo: string) => void;
    onCancel: () => void;
};

/**
 * Waits for a key combination. Takes focus and keeps the keys to itself, so neither the page nor the app's own
 * shortcuts react while recording. Esc or leaving it cancels; modifiers alone are ignored until a key joins them.
 */
export function KeyRecorder({ label, onRecord, onCancel }: KeyRecorderProps) {
    const ref = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        ref.current?.focus();
    }, []);

    return (
        <button
            ref={ref}
            type="button"
            aria-label={`Press the new key for ${label}, or Esc to cancel`}
            onKeyDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (event.key === "Escape") {
                    onCancel();
                    return;
                }
                const combo = comboFromEvent(event.nativeEvent);
                if (combo !== null) {
                    onRecord(combo);
                }
            }}
            onBlur={onCancel}
            className="inline-flex h-7 animate-pulse-soft items-center rounded-control border border-dashed border-accent px-2.5 text-small text-text motion-reduce:animate-none"
        >
            Press a key…
        </button>
    );
}
