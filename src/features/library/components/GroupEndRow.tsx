import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { LibraryGroup } from "../../../shared/ipc/bindings";
import { cx } from "../../../shared/lib/cx";
import { endRowId } from "../lib/libraryRows";

type GroupEndRowProps = {
    group: LibraryGroup;
    /** The group has no folders: it invites dropping some. */
    empty: boolean;
    compact: boolean;
    /** Nothing follows the group: the rail draws no line. */
    last: boolean;
};

/**
 * Where a group ends in the library list. A folder dragged above it stays in the group; past it, the folder leaves
 * the group. It is never dragged itself.
 */
export function GroupEndRow({ group, empty, compact, last }: GroupEndRowProps) {
    const { setNodeRef, transform, transition } = useSortable({
        id: endRowId(group.id),
        data: { type: "end" },
        disabled: { draggable: true },
    });
    return (
        <li
            ref={setNodeRef}
            aria-hidden={!empty || compact}
            style={{ transform: CSS.Translate.toString(transform) }}
            className={cx(
                transition && "transition-transform duration-(--duration-base) ease-standard",
                compact ? "flex h-3 w-10 items-center justify-center" : empty ? "pr-1" : "h-1.5"
            )}
        >
            {compact
                ? !last && <span className="h-px w-6 rounded-full bg-border-strong" />
                : empty && (
                      <span className="block rounded-control px-2.5 py-1.5 text-caption text-text-subtle">
                          Drag folders here
                      </span>
                  )}
        </li>
    );
}
