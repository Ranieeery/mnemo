import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import { MAX_UP_NEXT_WIDTH, MIN_UP_NEXT_WIDTH } from "../../../shared/ipc/bindings";
import { playerPreferences } from "../store";

/** How far one arrow key press moves the edge. */
const KEY_STEP = 16;

type UpNextResizeHandleProps = {
    /** The column being resized, to start from its current width when it still follows the window. */
    panelRef: RefObject<HTMLElement | null>;
    width: number | null;
};

/** The column may take at most half the window, so the video always keeps the larger part. */
function widest(): number {
    return Math.min(MAX_UP_NEXT_WIDTH, Math.max(MIN_UP_NEXT_WIDTH, window.innerWidth / 2));
}

/**
 * The left edge of the "Up next" column: drag it, or focus it and use the arrow keys, to change the column's width.
 * Double-click goes back to the automatic width. The width is saved with the player preferences.
 */
export function UpNextResizeHandle({ panelRef, width }: UpNextResizeHandleProps) {
    const currentWidth = () => width ?? panelRef.current?.offsetWidth ?? MIN_UP_NEXT_WIDTH;
    const resize = (next: number) => playerPreferences.setUpNextWidth(Math.min(next, widest()));

    const startDrag = (event: PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = currentWidth();
        // The column is on the right: moving the edge left makes it wider.
        const move = (moveEvent: globalThis.PointerEvent) => resize(startWidth + startX - moveEvent.clientX);
        const stop = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
            document.body.classList.remove("cursor-col-resize", "select-none");
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
        // Keeps the resize cursor and avoids selecting text while the pointer crosses the page.
        document.body.classList.add("cursor-col-resize", "select-none");
    };

    const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            // Arrow keys belong to this handle, not to the player's seek shortcuts.
            event.stopPropagation();
            resize(currentWidth() + (event.key === "ArrowLeft" ? KEY_STEP : -KEY_STEP));
        }
    };

    return (
        // biome-ignore lint/a11y/useSemanticElements: a focusable separator is the ARIA window splitter; <hr> cannot be.
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize Up next"
            aria-valuemin={MIN_UP_NEXT_WIDTH}
            aria-valuemax={MAX_UP_NEXT_WIDTH}
            aria-valuenow={Math.round(currentWidth())}
            tabIndex={0}
            title="Drag to resize, double-click to reset"
            onPointerDown={startDrag}
            onKeyDown={handleKey}
            onDoubleClick={() => playerPreferences.setUpNextWidth(null)}
            className="group absolute inset-y-0 -left-1.5 z-10 flex w-3 cursor-col-resize justify-center outline-none"
        >
            <span className="h-full w-0.5 bg-transparent transition-colors duration-(--duration-fast) ease-standard group-hover:bg-accent group-focus-visible:bg-focus-ring" />
        </div>
    );
}
