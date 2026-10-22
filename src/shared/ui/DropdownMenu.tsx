import { ArrowDown, ArrowUp, Check } from "lucide-react";
import { DropdownMenu as Primitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../lib/cx";
import type { SortDirection } from "../lib/sortDirection";
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

type DropdownMenuSortItemProps = {
    value: string;
    /** The direction when this is the field sorted by; null when it is not. */
    direction: SortDirection | null;
    /** What the direction means for this field ("A to Z"), read after its name. */
    directionLabel: string;
    onChoose: () => void;
    children: ReactNode;
};

/**
 * A field to sort by, inside a radio group whose value is the current field. Choosing it keeps the menu open, so
 * choosing it again reverses the direction right away; an arrow shows the direction of the current field.
 */
export function DropdownMenuSortItem({
    value,
    direction,
    directionLabel,
    onChoose,
    children,
}: DropdownMenuSortItemProps) {
    const DirectionIcon = direction === "desc" ? ArrowDown : ArrowUp;
    return (
        <DropdownMenuRadioItem
            value={value}
            onSelect={(event) => {
                event.preventDefault();
                onChoose();
            }}
        >
            {children}
            {direction && (
                <span className="ml-auto flex items-center">
                    <DirectionIcon aria-hidden />
                    <span className="sr-only">, {directionLabel}</span>
                </span>
            )}
        </DropdownMenuRadioItem>
    );
}

export function DropdownMenuSeparator() {
    return <Primitive.Separator className={menuSeparatorClasses} />;
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
    return <Primitive.Label className={menuLabelClasses}>{children}</Primitive.Label>;
}
