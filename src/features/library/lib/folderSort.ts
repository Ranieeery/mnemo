import type { LibraryFolderSort } from "../../../shared/ipc/bindings";
import { nextDirection, type SortDirection } from "../../../shared/lib/sortDirection";

/** The choices of the sort menu: Name and Date added are one option each, chosen again to reverse. */
export type FolderSortOption = "custom" | "name" | "added" | "recentlyWatched";

type SortState = { option: FolderSortOption; direction: SortDirection | null };

/** How each saved mode shows in the menu. Ascending dates are the oldest first, as in a folder's videos. */
const sortStates: Record<LibraryFolderSort, SortState> = {
    custom: { option: "custom", direction: null },
    nameAscending: { option: "name", direction: "asc" },
    nameDescending: { option: "name", direction: "desc" },
    oldestFirst: { option: "added", direction: "asc" },
    newestFirst: { option: "added", direction: "desc" },
    recentlyWatched: { option: "recentlyWatched", direction: null },
};

const sorts = Object.keys(sortStates).filter((sort): sort is LibraryFolderSort => sort in sortStates);

export function sortState(sort: LibraryFolderSort): SortState {
    return sortStates[sort];
}

/** The mode saved when `option` is chosen: a direction option keeps its field and reverses, or starts ascending. */
export function chosenSort(current: LibraryFolderSort, option: FolderSortOption): LibraryFolderSort {
    const state = sortStates[current];
    const direction =
        option === "name" || option === "added"
            ? nextDirection(state.option === option ? state.direction : null)
            : null;
    return (
        sorts.find((sort) => sortStates[sort].option === option && sortStates[sort].direction === direction) ?? current
    );
}
