import type { ReactNode } from "react";
import { cx } from "../../../shared/lib/cx";
import { iconLabel } from "../lib/iconPicker";

type IconOptionProps = {
    name: string;
    selected: boolean;
    onSelect: (name: string) => void;
    children: ReactNode;
};

/** One choice in an icon grid. The grid around it has `role="radiogroup"`. */
export function IconOption({ name, selected, onSelect, children }: IconOptionProps) {
    return (
        // biome-ignore lint/a11y/useSemanticElements: a grid of icon buttons reads better than radio inputs.
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={iconLabel(name)}
            title={iconLabel(name)}
            onClick={() => onSelect(name)}
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
