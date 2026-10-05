import { Check } from "lucide-react";
import { DropdownMenu as Primitive } from "radix-ui";
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

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuRadioGroup = Primitive.RadioGroup;

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof Primitive.Content>) {
    return (
        <Primitive.Portal>
            <Primitive.Content sideOffset={sideOffset} className={cx(menuContentClasses, className)} {...props} />
        </Primitive.Portal>
    );
}

type DropdownMenuItemProps = ComponentProps<typeof Primitive.Item> & {
    icon?: ReactNode;
    shortcut?: string;
    tone?: "default" | "danger";
};

export function DropdownMenuItem({
    icon,
    shortcut,
    tone = "default",
    className,
    children,
    ...props
}: DropdownMenuItemProps) {
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

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof Primitive.RadioItem>) {
    return (
        <Primitive.RadioItem className={cx(menuItemClasses, menuSelectableItemClasses, className)} {...props}>
            <Primitive.ItemIndicator className={menuIndicatorClasses}>
                <Check />
            </Primitive.ItemIndicator>
            {children}
        </Primitive.RadioItem>
    );
}

export function DropdownMenuSeparator() {
    return <Primitive.Separator className={menuSeparatorClasses} />;
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
    return <Primitive.Label className={menuLabelClasses}>{children}</Primitive.Label>;
}
