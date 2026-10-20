import type { ReactNode } from "react";
import type { LibraryFolder, LibraryGroup } from "../../../shared/ipc/bindings";
import { cx } from "../../../shared/lib/cx";
import { isWithin } from "../../../shared/lib/paths";
import { GroupEndRow } from "./GroupEndRow";
import { LibraryGroupHeader } from "./LibraryGroupHeader";
import { RailGroupSeparator } from "./RailGroupSeparator";

type LibraryGroupBlockProps = {
    group: LibraryGroup;
    folders: LibraryFolder[];
    /** Its folders and its end show (the rail always expands groups). */
    expanded: boolean;
    /** Nothing comes after it in the list, so the rail draws no line at its end. */
    last: boolean;
    currentPath: string | undefined;
    compact: boolean;
    /** It can be dragged and moved; off when it is all the list has. */
    sortable: boolean;
    /** Its header is being pressed, before the group is picked up. */
    held: boolean;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    /** Its folders, already drawn. */
    children: ReactNode;
};

/**
 * A group in the library list: its header (in the rail, a line), then, expanded, its folders, indented along a guide
 * line, and its end, where a folder dragged past it leaves the group. The rail leaves out a group without folders.
 */
export function LibraryGroupBlock({
    group,
    folders,
    expanded,
    last,
    currentPath,
    compact,
    sortable,
    held,
    onMoveUp,
    onMoveDown,
    children,
}: LibraryGroupBlockProps) {
    if (compact && folders.length === 0) {
        return null;
    }
    const listId = `library-group-${group.id}-folders`;
    const holdsCurrent = currentPath !== undefined && folders.some((folder) => isWithin(currentPath, folder.path));

    return (
        <li className={cx("flex flex-col gap-0.5", compact && "items-center")}>
            {compact ? (
                <RailGroupSeparator group={group} count={folders.length} />
            ) : (
                <LibraryGroupHeader
                    group={group}
                    count={folders.length}
                    listId={listId}
                    holdsCurrent={holdsCurrent && !expanded}
                    sortable={sortable}
                    held={held}
                    onMoveUp={onMoveUp}
                    onMoveDown={onMoveDown}
                />
            )}
            {expanded && (
                <ul
                    id={listId}
                    aria-label={group.name}
                    className={cx(
                        "flex flex-col gap-0.5",
                        compact ? "items-center" : "ml-3.5 border-l border-border pl-1"
                    )}
                >
                    {children}
                    <GroupEndRow group={group} empty={folders.length === 0} compact={compact} last={last} />
                </ul>
            )}
        </li>
    );
}
