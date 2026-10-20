import { ArrowDownAZ, ArrowDownZA, CalendarArrowDown, CalendarArrowUp, History, ListOrdered } from "lucide-react";
import type { ReactNode } from "react";
import type { LibraryFolderSort } from "../../../shared/ipc/bindings";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
    IconButton,
} from "../../../shared/ui";
import { useLibraryFolderSort, useSetLibraryFolderSort } from "../queries";

type SortOption = { value: LibraryFolderSort; label: string; icon: ReactNode };

const customOrder: SortOption = { value: "custom", label: "Custom order", icon: <ListOrdered /> };

const sortOptions: SortOption[] = [
    customOrder,
    { value: "nameAscending", label: "Name (A–Z)", icon: <ArrowDownAZ /> },
    { value: "nameDescending", label: "Name (Z–A)", icon: <ArrowDownZA /> },
    { value: "newestFirst", label: "Newest first", icon: <CalendarArrowDown /> },
    { value: "oldestFirst", label: "Oldest first", icon: <CalendarArrowUp /> },
    { value: "recentlyWatched", label: "Recently watched", icon: <History /> },
];

/** Chooses how the library folders are sorted; the button's icon and name tell the current mode. */
export function LibrarySortMenu({ compact = false }: { compact?: boolean }) {
    const sort = useLibraryFolderSort();
    const setSort = useSetLibraryFolderSort();
    const current = sortOptions.find((option) => option.value === sort.data) ?? customOrder;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <IconButton
                    label={`Sort folders: ${current.label}`}
                    icon={current.icon}
                    size="sm"
                    tooltipSide={compact ? "right" : undefined}
                    disabled={sort.isPending}
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent align={compact ? "start" : "end"} side={compact ? "right" : "bottom"}>
                <DropdownMenuLabel>Sort folders by</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={current.value}
                    onValueChange={(value) => {
                        const option = sortOptions.find((candidate) => candidate.value === value);
                        if (option && option.value !== current.value) {
                            setSort.mutate(option.value);
                        }
                    }}
                >
                    {sortOptions.map((option) => (
                        <DropdownMenuRadioItem key={option.value} value={option.value}>
                            {option.label}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
