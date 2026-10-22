export type SortDirection = "asc" | "desc";

/**
 * The direction a field gets when it is chosen: `current` is its direction if it is already the field sorted by,
 * null if not. Choosing another field sorts ascending; choosing the current one again reverses it.
 */
export function nextDirection(current: SortDirection | null): SortDirection {
    return current === "asc" ? "desc" : "asc";
}
