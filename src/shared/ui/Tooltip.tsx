import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactElement, ReactNode } from "react";
import { Kbd } from "./Kbd";

type TooltipProps = {
    content: ReactNode;
    /** Keyboard shortcut shown next to the content, e.g. "K". */
    shortcut?: string;
    side?: "top" | "right" | "bottom" | "left";
    /** The trigger. Must be a single focusable element that accepts a ref. */
    children: ReactElement;
};

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ content, shortcut, side = "top", children }: TooltipProps) {
    return (
        <TooltipPrimitive.Root>
            <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
            <TooltipPrimitive.Portal>
                <TooltipPrimitive.Content
                    side={side}
                    sideOffset={6}
                    className="z-50 flex items-center gap-2 rounded-control bg-surface-raised px-2 py-1 text-small text-text shadow-overlay data-[state=closed]:animate-disappear data-[state=delayed-open]:animate-appear"
                >
                    {content}
                    {shortcut && <Kbd>{shortcut}</Kbd>}
                </TooltipPrimitive.Content>
            </TooltipPrimitive.Portal>
        </TooltipPrimitive.Root>
    );
}
