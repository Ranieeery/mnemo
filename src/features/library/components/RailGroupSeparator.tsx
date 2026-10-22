import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { LibraryGroup } from "../../../shared/ipc/bindings";
import { cx } from "../../../shared/lib/cx";
import { plural } from "../../../shared/lib/plural";
import { Tooltip } from "../../../shared/ui";
import { groupRowId } from "../lib/libraryRows";

/**
 * Where a group starts in the collapsed rail: a faint line, with the group's name in a tooltip. A folder dragged
 * past it goes into the group. Screen readers get the name from the list that follows.
 */
export function RailGroupSeparator({ group, count }: { group: LibraryGroup; count: number }) {
    const { setNodeRef, transform, transition, isOver } = useSortable({
        id: groupRowId(group.id),
        data: { type: "group" },
        // The rail has no header to hold: groups are moved in the expanded sidebar.
        disabled: { draggable: true },
    });
    return (
        <Tooltip
            content={[group.name, group.pinned && "Pinned", plural(count, "folder")].filter(Boolean).join(" · ")}
            side="right"
        >
            <div
                ref={setNodeRef}
                aria-hidden
                style={{ transform: CSS.Translate.toString(transform) }}
                className={cx(
                    "flex h-3 w-10 items-center justify-center",
                    transition && "transition-transform duration-(--duration-base) ease-standard"
                )}
            >
                <span
                    className={cx(
                        "w-6 rounded-full transition-colors duration-(--duration-fast) ease-standard",
                        isOver ? "h-0.5 bg-accent" : "h-px bg-border-strong"
                    )}
                />
            </div>
        </Tooltip>
    );
}
