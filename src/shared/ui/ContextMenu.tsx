import { ChevronRight } from "lucide-react";
import { ContextMenu as Primitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../lib/cx";
import {
    menuContentClasses,
    menuDangerItemClasses,
    menuItemClasses,
    menuLabelClasses,
    menuSeparatorClasses,
    menuShortcutClasses,
} from "./menuStyles";

/** Right-click menu. Also opens from the keyboard (context menu key / Shift+F10) on the focused trigger. */
export const ContextMenu = Primitive.Root;
export const ContextMenuTrigger = Primitive.Trigger;

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

export const ContextMenuSub = Primitive.Sub;

/** An item that opens a submenu: with the pointer, or with `→`/`Enter` (and `←` goes back). */
export function ContextMenuSubTrigger({
    icon,
    className,
    children,
    ...props
}: ComponentProps<typeof Primitive.SubTrigger> & { icon?: ReactNode }) {
    return (
        <Primitive.SubTrigger
            className={cx(menuItemClasses, "data-[state=open]:bg-surface-hover", className)}
            {...props}
        >
            {icon}
            {children}
            <ChevronRight aria-hidden className="ml-auto" />
        </Primitive.SubTrigger>
    );
}

export function ContextMenuSubContent({ className, ...props }: ComponentProps<typeof Primitive.SubContent>) {
    return (
        <Primitive.Portal>
            <Primitive.SubContent className={cx(menuContentClasses, className)} {...props} />
        </Primitive.Portal>
    );
}

export function ContextMenuSeparator() {
    return <Primitive.Separator className={menuSeparatorClasses} />;
}

export function ContextMenuLabel({ children }: { children: ReactNode }) {
    return <Primitive.Label className={menuLabelClasses}>{children}</Primitive.Label>;
}
