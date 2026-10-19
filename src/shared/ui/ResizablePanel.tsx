import {
    type ComponentProps,
    type KeyboardEvent,
    type PointerEvent,
    type ReactNode,
    type RefObject,
    useRef,
    useState,
} from "react";
import { cx } from "../lib/cx";

/** How far one arrow key press moves the edge. */
const KEY_STEP = 16;

type ResizablePanelProps = Omit<ComponentProps<"aside">, "style" | "ref"> & {
    /** Side of the window the panel sits on; its free edge, on the other side, is the one that is dragged. */
    side: "left" | "right";
    /** Width in pixels, or `null` to let `autoWidthClassName` decide (for example, to follow the window). */
    width: number | null;
    minWidth: number;
    maxWidth: number;
    /** The panel never takes more than this part of the window, so the main content keeps its room. */
    maxViewportFraction: number;
    onWidthChange: (width: number) => void;
    /** Double-clicking the edge calls this, to go back to the default width. */
    onReset: () => void;
    /** Accessible name of the edge, e.g. "Resize Up next". */
    resizeLabel: string;
    autoWidthClassName?: string;
    /**
     * Collapsible panels pass whether they are collapsed: the width then animates between both states and, while
     * collapsed, `collapsedClassName` sets it and the edge cannot be dragged.
     */
    collapsed?: boolean;
    collapsedClassName?: string;
    children: ReactNode;
};

/**
 * A side panel whose free edge can be dragged, or focused and moved with the arrow keys, to change its width. The
 * width is controlled by the caller, which keeps (and saves) it. Limits that depend on layout (`min-w-*`, `max-w-*`)
 * go in `className`, so a narrower window shrinks the panel without changing the chosen width.
 */
export function ResizablePanel({
    side,
    width,
    minWidth,
    maxWidth,
    maxViewportFraction,
    onWidthChange,
    onReset,
    resizeLabel,
    autoWidthClassName,
    collapsed,
    collapsedClassName,
    className,
    children,
    ...props
}: ResizablePanelProps) {
    const panelRef = useRef<HTMLElement>(null);
    const [dragging, setDragging] = useState(false);
    const collapsible = collapsed !== undefined;

    return (
        <aside
            ref={panelRef}
            style={collapsed || width === null ? undefined : { width }}
            className={cx(
                className,
                collapsed ? collapsedClassName : width === null && autoWidthClassName,
                // Following the pointer must be immediate; only collapsing and expanding animate.
                collapsible && !dragging && "transition-[width] duration-(--duration-base) ease-standard"
            )}
            {...props}
        >
            {!collapsed && (
                <ResizeHandle
                    panelRef={panelRef}
                    side={side}
                    width={width}
                    minWidth={minWidth}
                    maxWidth={maxWidth}
                    maxViewportFraction={maxViewportFraction}
                    onWidthChange={onWidthChange}
                    onReset={onReset}
                    onDraggingChange={setDragging}
                    label={resizeLabel}
                />
            )}
            {children}
        </aside>
    );
}

type ResizeHandleProps = Pick<
    ResizablePanelProps,
    "side" | "width" | "minWidth" | "maxWidth" | "maxViewportFraction" | "onWidthChange" | "onReset"
> & {
    /** The panel being resized, to start from its current width when `width` is automatic. */
    panelRef: RefObject<HTMLElement | null>;
    onDraggingChange: (dragging: boolean) => void;
    label: string;
};

/** The ARIA window splitter on the panel's free edge. */
function ResizeHandle({
    panelRef,
    side,
    width,
    minWidth,
    maxWidth,
    maxViewportFraction,
    onWidthChange,
    onReset,
    onDraggingChange,
    label,
}: ResizeHandleProps) {
    const currentWidth = () => width ?? panelRef.current?.offsetWidth ?? minWidth;
    const widest = () => Math.min(maxWidth, Math.max(minWidth, window.innerWidth * maxViewportFraction));
    const resize = (next: number) => onWidthChange(Math.round(Math.max(minWidth, Math.min(next, widest()))));
    // Moving the free edge away from the panel's side makes it wider.
    const direction = side === "left" ? 1 : -1;

    const startDrag = (event: PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = currentWidth();
        const move = (moveEvent: globalThis.PointerEvent) =>
            resize(startWidth + (moveEvent.clientX - startX) * direction);
        const stop = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
            document.body.classList.remove("cursor-col-resize", "select-none");
            onDraggingChange(false);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
        // Keeps the resize cursor and avoids selecting text while the pointer crosses the page.
        document.body.classList.add("cursor-col-resize", "select-none");
        onDraggingChange(true);
    };

    const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            // Arrow keys belong to this handle, not to shortcuts such as the player's seek.
            event.stopPropagation();
            resize(currentWidth() + (event.key === "ArrowRight" ? KEY_STEP : -KEY_STEP) * direction);
        }
    };

    return (
        // biome-ignore lint/a11y/useSemanticElements: a focusable separator is the ARIA window splitter; <hr> cannot be.
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={label}
            aria-valuemin={minWidth}
            aria-valuemax={maxWidth}
            aria-valuenow={Math.round(currentWidth())}
            tabIndex={0}
            title="Drag to resize, double-click to reset"
            onPointerDown={startDrag}
            onKeyDown={handleKey}
            onDoubleClick={onReset}
            className={cx(
                "group absolute inset-y-0 z-10 flex w-3 cursor-col-resize justify-center outline-none",
                side === "left" ? "-right-1.5" : "-left-1.5"
            )}
        >
            <span className="h-full w-0.5 bg-transparent transition-colors duration-(--duration-fast) ease-standard group-hover:bg-accent group-focus-visible:bg-focus-ring" />
        </div>
    );
}
