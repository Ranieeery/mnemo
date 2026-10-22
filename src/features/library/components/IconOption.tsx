import type { ReactNode } from "react";
import type { FolderColor } from "../../../shared/ipc/bindings";
import { cx } from "../../../shared/lib/cx";
import { folderColorValue, type RovingItemProps } from "../../../shared/ui";
import { iconLabel } from "../lib/iconPicker";

type IconOptionProps = RovingItemProps & {
    name: string;
    selected: boolean;
    onSelect: (name: string) => void;
    /** The color being chosen, so the grid previews every icon in it; `null` keeps the text colors. */
    color?: FolderColor | null;
    children: ReactNode;
};

/** One choice in an icon grid. The grid around it has `role="radiogroup"` and moves the tab stop (`useRovingFocus`). */
export function IconOption({ name, selected, onSelect, color = null, children, ...roving }: IconOptionProps) {
    return (
        // biome-ignore lint/a11y/useSemanticElements: a grid of icon buttons reads better than radio inputs.
        <button
            {...roving}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={iconLabel(name)}
            title={iconLabel(name)}
            onClick={() => onSelect(name)}
            // Lucide icons draw with `currentColor`, so the button's color previews the chosen one.
            style={color ? { color: folderColorValue(color) } : undefined}
            className={cx(
                "flex aspect-square w-full items-center justify-center rounded-control text-text-muted [&_svg]:size-5",
                "transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-hover hover:text-text",
                selected && "bg-surface-hover text-text ring-2 ring-accent"
            )}
        >
            {children}
        </button>
    );
}
