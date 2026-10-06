import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "../lib/cx";
import { IconButton } from "./IconButton";
import { scrollBehavior, useScrollElement } from "./ScrollContainer";

/**
 * Floats at the bottom right of the enclosing {@link ScrollContainer} once it is scrolled past one screen. Place it
 * last in the container: the zero-height sticky row keeps it in view without taking space in the layout.
 */
export function ScrollToTopButton() {
    const scrollElement = useScrollElement();
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const element = scrollElement.current;
        if (!element) {
            return;
        }
        const update = () => setVisible(element.scrollTop > element.clientHeight);
        update();
        element.addEventListener("scroll", update, { passive: true });
        return () => element.removeEventListener("scroll", update);
    }, [scrollElement]);

    return (
        <div className="pointer-events-none sticky bottom-0 h-0">
            <IconButton
                label="Back to top"
                icon={<ArrowUp />}
                variant="secondary"
                size="lg"
                tooltipSide="left"
                onClick={() => scrollElement.current?.scrollTo({ top: 0, behavior: scrollBehavior() })}
                className={cx(
                    "absolute right-6 bottom-6 shadow-raised transition-[opacity,visibility] duration-(--duration-base) ease-standard",
                    visible ? "pointer-events-auto visible opacity-100" : "invisible opacity-0"
                )}
            />
        </div>
    );
}
