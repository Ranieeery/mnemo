import { cx } from "../lib/cx";

/**
 * States of a sidebar entry (a navigation link or a library folder), expanded or in the collapsed rail. The current
 * entry has a raised background, a bar on its left edge and, expanded, a heavier label: none of it depends on the
 * color of its icon, which a library folder can choose. The element must be `relative`, for the bar.
 */
export function sidebarItemClasses(active: boolean, { subtle = false }: { subtle?: boolean } = {}): string {
    return cx(
        "rounded-control text-body transition-colors duration-(--duration-fast) ease-standard",
        active
            ? cx(
                  "bg-surface-raised font-medium text-text",
                  "before:absolute before:inset-y-2 before:left-0 before:w-0.75 before:rounded-full before:bg-accent"
              )
            : cx("hover:bg-surface-hover hover:text-text", subtle ? "text-text-subtle" : "text-text-muted")
    );
}
