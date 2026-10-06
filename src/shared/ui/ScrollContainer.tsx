import { createContext, type ReactNode, type RefObject, useContext, useRef } from "react";
import { cx } from "../lib/cx";

const ScrollElementContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

type ScrollContainerProps = {
    className?: string;
    children: ReactNode;
};

/** The scrolling region of a screen. Virtualized lists inside it measure against this element. */
export function ScrollContainer({ className, children }: ScrollContainerProps) {
    const ref = useRef<HTMLDivElement>(null);
    return (
        <ScrollElementContext value={ref}>
            <div ref={ref} className={cx("relative overflow-y-auto", className)}>
                {children}
            </div>
        </ScrollElementContext>
    );
}

/** Smooth scrolling, unless the user asked the system to reduce motion. */
export function scrollBehavior(): ScrollBehavior {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

export function useScrollElement(): RefObject<HTMLDivElement | null> {
    const ref = useContext(ScrollElementContext);
    if (!ref) {
        throw new Error("useScrollElement must be used inside a ScrollContainer");
    }
    return ref;
}
