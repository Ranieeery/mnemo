import { Popover as Primitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;
/** Positions the popover against an element other than its trigger (or without a trigger at all). */
export const PopoverAnchor = Primitive.Anchor;

/**
 * A small floating panel next to its anchor, for a quick edit that does not deserve a dialog. Not modal: `Esc` and
 * a click outside close it (`onEscapeKeyDown` and `onInteractOutside` tell them apart), and focus returns to the
 * trigger.
 */
export function PopoverContent({
    className,
    sideOffset = 8,
    collisionPadding = 8,
    ...props
}: ComponentProps<typeof Primitive.Content>) {
    return (
        <Primitive.Portal>
            <Primitive.Content
                sideOffset={sideOffset}
                collisionPadding={collisionPadding}
                className={cx(
                    "z-50 rounded-card bg-surface-raised p-3 text-body text-text shadow-overlay",
                    "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
                    className
                )}
                {...props}
            />
        </Primitive.Portal>
    );
}
