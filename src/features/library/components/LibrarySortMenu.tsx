import {
    ArrowDownAZ,
    ArrowDownZA,
    CalendarArrowDown,
    CalendarArrowUp,
    FolderPlus,
    History,
    ListOrdered,
} from "lucide-react";
import { type ReactNode, useRef } from "react";
import type { LibraryFolderSort } from "../../../shared/ipc/bindings";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuSortItem,
    DropdownMenuTrigger,
    IconButton,
} from "../../../shared/ui";
import { chosenSort, type FolderSortOption, sortState } from "../lib/folderSort";
import { useLibraryFolderSort, useSetLibraryFolderSort } from "../queries";
import { useNewGroup } from "./NewGroupContext";

const optionLabels: Record<FolderSortOption, string> = {
    custom: "Custom order",
    name: "Name",
    added: "Date added",
    recentlyWatched: "Recently watched",
};

/** What the direction of each mode means, read after the option's name. */
const directionLabels: Record<LibraryFolderSort, string> = {
    custom: "",
    nameAscending: "A to Z",
    nameDescending: "Z to A",
    oldestFirst: "oldest first",
    newestFirst: "newest first",
    recentlyWatched: "",
};

const sortIcons: Record<LibraryFolderSort, ReactNode> = {
    custom: <ListOrdered />,
    nameAscending: <ArrowDownAZ />,
    nameDescending: <ArrowDownZA />,
    oldestFirst: <CalendarArrowUp />,
    newestFirst: <CalendarArrowDown />,
    recentlyWatched: <History />,
};

/** Chooses how the library folders are sorted (the button's icon and name tell the current mode) and creates groups. */
export function LibrarySortMenu({ compact = false }: { compact?: boolean }) {
    const sort = useLibraryFolderSort();
    const setSort = useSetLibraryFolderSort();
    // Shows a choice while it is saved, so choosing Name or Date added again right away reverses that choice.
    const current = (setSort.isPending ? setSort.variables : sort.data) ?? "custom";
    const { option: currentOption, direction } = sortState(current);
    const currentLabel = direction
        ? `${optionLabels[currentOption]}, ${directionLabels[current]}`
        : optionLabels[currentOption];
    const newGroup = useNewGroup();
    const newGroupChosen = useRef(false);

    const choose = (option: FolderSortOption) => {
        const next = chosenSort(current, option);
        if (next !== current) {
            setSort.mutate(next);
        }
    };

    const sortItem = (option: "name" | "added") => (
        <DropdownMenuSortItem
            value={option}
            direction={currentOption === option ? direction : null}
            directionLabel={directionLabels[current]}
            onChoose={() => choose(option)}
        >
            {optionLabels[option]}
        </DropdownMenuSortItem>
    );

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <IconButton
                    label={`Sort folders: ${currentLabel}`}
                    icon={sortIcons[current]}
                    size="sm"
                    tooltipSide={compact ? "right" : undefined}
                    disabled={sort.isPending}
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align={compact ? "start" : "end"}
                side={compact ? "right" : "bottom"}
                onCloseAutoFocus={(event) => {
                    // The new group's name field opens once the menu is gone, which would take the focus back.
                    if (newGroupChosen.current) {
                        newGroupChosen.current = false;
                        event.preventDefault();
                        newGroup.start(null);
                    }
                }}
            >
                <DropdownMenuLabel>Sort folders by (choose again to reverse)</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={currentOption}>
                    <DropdownMenuRadioItem value="custom" onSelect={() => choose("custom")}>
                        {optionLabels.custom}
                    </DropdownMenuRadioItem>
                    {sortItem("name")}
                    {sortItem("added")}
                    <DropdownMenuRadioItem value="recentlyWatched" onSelect={() => choose("recentlyWatched")}>
                        {optionLabels.recentlyWatched}
                    </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    icon={<FolderPlus />}
                    onSelect={() => {
                        newGroupChosen.current = true;
                    }}
                >
                    New group…
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
