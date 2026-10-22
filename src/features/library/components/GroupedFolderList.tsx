import { DndContext, DragOverlay } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import type { LibraryEntry, LibraryFolder, LibraryGroup } from "../../../shared/ipc/bindings";
import { cx } from "../../../shared/lib/cx";
import { FolderIcon } from "../../../shared/ui";
import { useLibraryDrag } from "../hooks/useLibraryDrag";
import {
    atPinEdge,
    entryKey,
    flatFolders,
    groupsOf,
    isPinned,
    type LibraryItem,
    stepFolder,
    stepGroup,
} from "../lib/folderLayout";
import { groupRowId } from "../lib/libraryRows";
import { useArrangeLibrary, useSetLibraryItemPinned } from "../queries";
import { LibraryFolderItem } from "./LibraryFolderItem";
import { LibraryGroupBlock } from "./LibraryGroupBlock";
import { NewGroupEditor } from "./NewGroupEditor";
import { PinnedDivider } from "./PinnedDivider";

/** Why "Move up" and "Move down" stop at the edge of the pinned items. */
const PIN_EDGE_REASON = {
    up: "Pinned items stay above. Pin it to move it there.",
    down: "Pinned items stay on top. Unpin it to move it lower.",
};

type GroupedFolderListProps = {
    /** The library in the order it is shown: folders without a group and groups with their folders. */
    entries: LibraryEntry[];
    currentPath: string | undefined;
    compact: boolean;
};

/**
 * The library folders, with the groups among them. Folders move by dragging them (with the mouse, or picking one up
 * with `Space` and moving it with the arrow keys), into a group, out of it or within it, or with the menu; groups move
 * by holding and dragging their header, or with the menu. Moving switches to the custom order, from the order on
 * screen. Pinned items lead each list (the library's and each group's), above a line, and move only among themselves.
 */
export function GroupedFolderList({ entries, currentPath, compact }: GroupedFolderListProps) {
    const arrange = useArrangeLibrary();
    const setPinned = useSetLibraryItemPinned();
    const { shown, rows, expanded, dndProps, strategy, heldId, draggedFolder, draggedGroup } = useLibraryDrag(
        entries,
        compact
    );
    // The item just pinned or unpinned takes the focus at its new place, and screen readers hear what happened.
    const [focusKey, setFocusKey] = useState<string | null>(null);
    const [pinMessage, setPinMessage] = useState("");
    const grouped = groupsOf(entries).length > 0;
    const sortable = flatFolders(entries).length > 1 || grouped;
    // The rail leaves empty groups out, so the last group shown may come before some.
    const listed = (entry: LibraryEntry) => !compact || entry.kind === "folder" || entry.folders.length > 0;
    const lastShown = shown.findLast(listed);
    const moveBy = (moved: "folder" | "group", next: LibraryEntry[] | null) =>
        next ? () => arrange.mutate({ entries: next, moved }) : undefined;
    const edgeReasons = (item: LibraryItem) => ({
        moveUpReason: atPinEdge(entries, item, -1) ? PIN_EDGE_REASON.up : undefined,
        moveDownReason: atPinEdge(entries, item, 1) ? PIN_EDGE_REASON.down : undefined,
    });
    const pinControls = (item: LibraryItem, name: string, pinned: boolean, groupName?: string) => {
        const key = `${item.kind}:${item.id}`;
        const done = pinned ? `${name} unpinned.` : `${name} pinned to the top${groupName ? ` of ${groupName}` : ""}.`;
        return {
            focusRequested: focusKey === key,
            onFocused: () => setFocusKey(null),
            onTogglePin: () =>
                setPinned.mutate(
                    { item, pinned: !pinned },
                    {
                        onSuccess: () => {
                            setFocusKey(key);
                            setPinMessage(done);
                        },
                    }
                ),
        };
    };
    /** Whether the line goes before the item at `index`. The rail ends a group with a line, which then marks it. */
    const dividerBefore = (index: number) => {
        const entry = shown[index];
        const previous = shown.slice(0, index).findLast(listed);
        return (
            entry !== undefined &&
            listed(entry) &&
            !isPinned(entry) &&
            previous !== undefined &&
            isPinned(previous) &&
            !(compact && previous.kind === "group")
        );
    };
    const folderItem = (folder: LibraryFolder, group: LibraryGroup | null) => {
        const item: LibraryItem = { kind: "folder", id: folder.id };
        return (
            <LibraryFolderItem
                key={folder.id}
                folder={folder}
                currentPath={currentPath}
                compact={compact}
                sortable={sortable}
                groupName={group?.name}
                held={heldId === folder.id}
                onMoveUp={moveBy("folder", stepFolder(entries, folder.id, -1))}
                onMoveDown={moveBy("folder", stepFolder(entries, folder.id, 1))}
                {...edgeReasons(item)}
                {...pinControls(item, folder.name, folder.pinned, group?.name)}
            />
        );
    };
    // Inside a group the rail shows no line: its icons are already set apart by the group's own lines.
    const groupFolders = (folders: LibraryFolder[], group: LibraryGroup) =>
        folders.flatMap((folder, index) => [
            !compact && folders[index - 1]?.pinned === true && !folder.pinned && (
                <PinnedDivider key="pinned-edge" compact={compact} />
            ),
            folderItem(folder, group),
        ]);
    const groupBlock = (entry: Extract<LibraryEntry, { kind: "group" }>) => {
        const { group, folders } = entry;
        const item: LibraryItem = { kind: "group", id: group.id };
        return (
            <LibraryGroupBlock
                key={entryKey(entry)}
                group={group}
                folders={folders}
                expanded={expanded(group)}
                last={entry === lastShown}
                currentPath={currentPath}
                compact={compact}
                sortable={entries.length > 1}
                held={heldId === groupRowId(group.id)}
                onMoveUp={moveBy("group", stepGroup(entries, group.id, -1))}
                onMoveDown={moveBy("group", stepGroup(entries, group.id, 1))}
                {...edgeReasons(item)}
                {...pinControls(item, group.name, group.pinned)}
            >
                {groupFolders(folders, group)}
            </LibraryGroupBlock>
        );
    };

    return (
        <DndContext {...dndProps}>
            <SortableContext items={rows.map((row) => row.id)} strategy={strategy}>
                <div className="flex min-h-0 flex-col overflow-y-auto">
                    <ul className={cx("flex flex-col gap-0.5", compact && "items-center")}>
                        {shown.flatMap((entry, index) => [
                            dividerBefore(index) && <PinnedDivider key="pinned-edge" compact={compact} />,
                            entry.kind === "folder" ? folderItem(entry.folder, null) : groupBlock(entry),
                        ])}
                    </ul>
                    <NewGroupEditor compact={compact} />
                    <p role="status" className="sr-only">
                        {pinMessage}
                    </p>
                </div>
            </SortableContext>
            {/* No drop animation: the folder settles into the slot marked in the list. */}
            <DragOverlay dropAnimation={null}>
                {draggedFolder && <DraggedFolder folder={draggedFolder} compact={compact} />}
                {draggedGroup && <DraggedGroup group={draggedGroup} />}
            </DragOverlay>
        </DndContext>
    );
}

const liftedClasses = cx(
    "flex cursor-grabbing items-center rounded-control border border-border-strong bg-surface-raised text-text",
    "shadow-raised"
);

/** The folder lifted under the pointer while it is dragged. */
function DraggedFolder({ folder, compact }: { folder: LibraryFolder; compact: boolean }) {
    return (
        <div
            className={cx(
                liftedClasses,
                "gap-2.5 text-body",
                compact ? "h-9 w-10 justify-center" : "min-h-9 px-2.5 py-1.5"
            )}
        >
            <FolderIcon name={folder.customIcon} color={folder.iconColor} />
            {!compact && <span className="line-clamp-2 min-w-0 flex-1 break-words">{folder.name}</span>}
        </div>
    );
}

/** The group header lifted under the pointer while the group is dragged. */
function DraggedGroup({ group }: { group: LibraryGroup }) {
    return (
        <div className={cx(liftedClasses, "min-h-8 gap-1.5 px-2.5 py-1 text-small font-medium")}>
            <ChevronRight aria-hidden className="size-3.5 shrink-0" />
            <span className="line-clamp-2 min-w-0 flex-1 break-words">{group.name}</span>
        </div>
    );
}
