import { ArrowDown, ArrowUp, ListFilter } from "lucide-react";
import { cx } from "../../../shared/lib/cx";
import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "../../../shared/ui";
import {
    isStatusFilter,
    nextSort,
    SORT_FIELDS,
    type SortField,
    STATUS_FILTERS,
    type StatusFilter,
    sortDirection,
    sortField,
    type VideoOrder,
    type VideoSort,
} from "../lib/videoOrder";

const fieldLabels: Record<SortField, string> = {
    name: "Name",
    duration: "Duration",
    added: "Date added",
};

/** What each direction means for a field, for screen readers and the trigger's name. */
const directionLabels: Record<VideoSort, string> = {
    "name-asc": "A to Z",
    "name-desc": "Z to A",
    "duration-asc": "shortest first",
    "duration-desc": "longest first",
    "added-asc": "oldest first",
    "added-desc": "newest first",
};

export const statusLabels: Record<StatusFilter, string> = {
    all: "All videos",
    unwatched: "Unwatched",
    "in-progress": "In progress",
    watched: "Watched",
};

type VideoOrderMenusProps = {
    order: VideoOrder;
    onChange: (order: VideoOrder) => void;
};

/** Sort and status filter for a folder's videos, next to its view mode. */
export function VideoOrderMenus({ order, onChange }: VideoOrderMenusProps) {
    const field = sortField(order.sort);
    const DirectionIcon = sortDirection(order.sort) === "asc" ? ArrowUp : ArrowDown;
    const filtered = order.status !== "all";

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        icon={<DirectionIcon />}
                        aria-label={`Sort by ${fieldLabels[field].toLowerCase()}, ${directionLabels[order.sort]}`}
                    >
                        {fieldLabels[field]}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Sort by (choose again to reverse)</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={field}>
                        {SORT_FIELDS.map((option) => (
                            <DropdownMenuRadioItem
                                key={option}
                                value={option}
                                onSelect={(event) => {
                                    // Stays open, so choosing the field again reverses it right away.
                                    event.preventDefault();
                                    onChange({ ...order, sort: nextSort(order.sort, option) });
                                }}
                            >
                                {fieldLabels[option]}
                                {option === field && (
                                    <span className="ml-auto flex items-center">
                                        <DirectionIcon aria-hidden />
                                        <span className="sr-only">, {directionLabels[order.sort]}</span>
                                    </span>
                                )}
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        icon={<ListFilter />}
                        aria-label={`Show ${statusLabels[order.status].toLowerCase()}`}
                        className={cx(filtered && "border-accent")}
                    >
                        {statusLabels[order.status]}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Show</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                        value={order.status}
                        onValueChange={(status) => isStatusFilter(status) && onChange({ ...order, status })}
                    >
                        {STATUS_FILTERS.map((status) => (
                            <DropdownMenuRadioItem key={status} value={status}>
                                {statusLabels[status]}
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    );
}
