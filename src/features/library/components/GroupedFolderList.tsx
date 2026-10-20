import { DndContext, DragOverlay } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronRight } from "lucide-react";
import type { LibraryEntry, LibraryFolder, LibraryGroup } from "../../../shared/ipc/bindings";
import { cx } from "../../../shared/lib/cx";
import { FolderIcon } from "../../../shared/ui";
import { useLibraryDrag } from "../hooks/useLibraryDrag";
import { entryKey, flatFolders, groupsOf, stepFolder, stepGroup } from "../lib/folderLayout";
import { groupRowId } from "../lib/libraryRows";
import { useArrangeLibrary } from "../queries";
import { LibraryFolderItem } from "./LibraryFolderItem";
import { LibraryGroupBlock } from "./LibraryGroupBlock";
import { NewGroupEditor } from "./NewGroupEditor";

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
 * screen.
 */
export function GroupedFolderList({ entries, currentPath, compact }: GroupedFolderListProps) {
    const arrange = useArrangeLibrary();
    const { shown, rows, expanded, dndProps, heldId, draggedFolder, draggedGroup } = useLibraryDrag(entries, compact);
    const grouped = groupsOf(entries).length > 0;
    const sortable = flatFolders(entries).length > 1 || grouped;
    // The rail leaves empty groups out, so the last group shown may come before some.
    const lastShown = shown.findLast((entry) => !compact || entry.kind === "folder" || entry.folders.length > 0);
    const moveBy = (moved: "folder" | "group", next: LibraryEntry[] | null) =>
        next ? () => arrange.mutate({ entries: next, moved }) : undefined;
    const folderItem = (folder: LibraryFolder, group: LibraryGroup | null) => (
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
        />
    );

    return (
        <DndContext {...dndProps}>
            <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
                <div className="flex min-h-0 flex-col overflow-y-auto">
                    <ul className={cx("flex flex-col gap-0.5", compact && "items-center")}>
                        {shown.map((entry) =>
                            entry.kind === "folder" ? (
                                folderItem(entry.folder, null)
                            ) : (
                                <LibraryGroupBlock
                                    key={entryKey(entry)}
                                    group={entry.group}
                                    folders={entry.folders}
                                    expanded={expanded(entry.group)}
                                    last={entry === lastShown}
                                    currentPath={currentPath}
                                    compact={compact}
                                    sortable={entries.length > 1}
                                    held={heldId === groupRowId(entry.group.id)}
                                    onMoveUp={moveBy("group", stepGroup(entries, entry.group.id, -1))}
                                    onMoveDown={moveBy("group", stepGroup(entries, entry.group.id, 1))}
                                >
                                    {entry.folders.map((folder) => folderItem(folder, entry.group))}
                                </LibraryGroupBlock>
                            )
                        )}
                    </ul>
                    <NewGroupEditor compact={compact} />
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
