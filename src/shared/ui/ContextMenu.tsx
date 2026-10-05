import { Check } from "lucide-react";
import { ContextMenu as Primitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../lib/cx";
import {
    menuContentClasses,
    menuDangerItemClasses,
    menuIndicatorClasses,
    menuItemClasses,
    menuLabelClasses,
    menuSelectableItemClasses,
    menuSeparatorClasses,
    menuShortcutClasses,
} from "./menuStyles";

/** Right-click menu. Also opens from the keyboard (context menu key / Shift+F10) on the focused trigger. */
export const ContextMenu = Primitive.Root;
export const ContextMenuTrigger = Primitive.Trigger;
export const ContextMenuRadioGroup = Primitive.RadioGroup;

export function ContextMenuContent({ className, ...props }: ComponentProps<typeof Primitive.Content>) {
    return (
        <Primitive.Portal>
            <Primitive.Content className={cx(menuContentClasses, className)} {...props} />
        </Primitive.Portal>
    );
}

type ContextMenuItemProps = ComponentProps<typeof Primitive.Item> & {
    icon?: ReactNode;
    shortcut?: string;
    tone?: "default" | "danger";
};

export function ContextMenuItem({
    icon,
    shortcut,
    tone = "default",
    className,
    children,
    ...props
}: ContextMenuItemProps) {
    return (
        <Primitive.Item
            className={cx(menuItemClasses, tone === "danger" && menuDangerItemClasses, className)}
            {...props}
        >
            {icon}
            {children}
            {shortcut && <span className={menuShortcutClasses}>{shortcut}</span>}
        </Primitive.Item>
    );
}

export function ContextMenuRadioItem({ className, children, ...props }: ComponentProps<typeof Primitive.RadioItem>) {
    return (
        <Primitive.RadioItem className={cx(menuItemClasses, menuSelectableItemClasses, className)} {...props}>
            <Primitive.ItemIndicator className={menuIndicatorClasses}>
                <Check />
            </Primitive.ItemIndicator>
            {children}
        </Primitive.RadioItem>
    );
}

export function ContextMenuSeparator() {
    return <Primitive.Separator className={menuSeparatorClasses} />;
}

export function ContextMenuLabel({ children }: { children: ReactNode }) {
    return <Primitive.Label className={menuLabelClasses}>{children}</Primitive.Label>;
}
