import { cx } from "../lib/cx";

/** Shared look of dropdown and context menus, so both read as the same component. */
export const menuContentClasses = cx(
    "z-50 min-w-48 overflow-hidden rounded-card bg-surface-raised p-1 text-body text-text shadow-overlay",
    "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out"
);

export const menuItemClasses = cx(
    "relative flex h-8 cursor-default select-none items-center gap-2 rounded-control px-2 outline-none",
    "data-[highlighted]:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
    "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-text-muted"
);

export const menuDangerItemClasses = "text-danger [&_svg]:text-danger data-[highlighted]:bg-danger/15";

export const menuSeparatorClasses = "my-1 h-px bg-border";

export const menuLabelClasses = "px-2 py-1.5 text-caption font-medium text-text-subtle";

export const menuShortcutClasses = "ml-auto pl-4 text-caption text-text-subtle";

/** Radio and checkbox items reserve room for the indicator on the left. */
export const menuSelectableItemClasses = "pl-7";

export const menuIndicatorClasses = "absolute left-2 flex size-4 items-center justify-center [&_svg]:text-text";
