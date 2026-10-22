/**
 * The line between the pinned items of a list and the others; in the rail, a line like the one that ends a group.
 * Screen readers hear "pinned" in the names instead.
 */
export function PinnedDivider({ compact }: { compact: boolean }) {
    return (
        <li aria-hidden className={compact ? "flex h-3 w-10 items-center justify-center" : "px-2.5 py-1"}>
            <hr className={compact ? "w-6 border-border-strong" : "border-border"} />
        </li>
    );
}
