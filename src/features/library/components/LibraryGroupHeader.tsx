import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { LibraryGroup } from "../../../shared/ipc/bindings";
import { cx } from "../../../shared/lib/cx";
import { plural } from "../../../shared/lib/plural";
import {
    ConfirmDialog,
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "../../../shared/ui";
import { useDeleteLibraryGroup, useRenameLibraryGroup, useSetLibraryGroupCollapsed } from "../groupQueries";
import { groupRowId } from "../lib/libraryRows";
import { HOLD_TO_DRAG_MS } from "./LibraryFolderItem";
import { type NameDone, NameField } from "./NameField";
import { useNewGroup } from "./NewGroupContext";

type LibraryGroupHeaderProps = {
    group: LibraryGroup;
    /** How many folders it has, shown so a collapsed group still tells what it holds. */
    count: number;
    /** Id of the list of its folders, which the header expands and collapses. */
    listId: string;
    /** Collapsed while the folder being browsed is inside: the header carries the mark of the current entry. */
    holdsCurrent: boolean;
    /** It can be dragged and moved in the list; off when it is all the list has. */
    sortable: boolean;
    /** Being pressed: a bar fills while the press lasts, until the group is picked up. */
    held: boolean;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
};

/**
 * The header of a group in the expanded sidebar: expands and collapses its folders (click, `Enter` or `Space`), and is
 * held and dragged to move the group. A folder held over it opens it while collapsed. `F2` renames it.
 */
export function LibraryGroupHeader({
    group,
    count,
    listId,
    holdsCurrent,
    sortable,
    held,
    onMoveUp,
    onMoveDown,
}: LibraryGroupHeaderProps) {
    const [renaming, setRenaming] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const { listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging, isOver, active } =
        useSortable({
            id: groupRowId(group.id),
            data: { type: "group" },
            // Folders still move past it when the group cannot be moved.
            disabled: { draggable: !sortable || renaming, droppable: false },
        });
    const setCollapsed = useSetLibraryGroupCollapsed();
    const rename = useRenameLibraryGroup();
    const deleteGroup = useDeleteLibraryGroup();
    const { focusGroupId, clearFocusGroup } = useNewGroup();
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const focusAfterRename = useRef(false);
    // Renaming starts once the menu is gone, or the menu would take the focus back from the field.
    const renameChosen = useRef(false);
    const folderOver = isOver && active?.data.current?.type === "folder";

    useEffect(() => {
        if (focusGroupId === group.id) {
            clearFocusGroup();
            buttonRef.current?.focus();
        }
    }, [focusGroupId, group.id, clearFocusGroup]);

    useEffect(() => {
        if (!renaming && focusAfterRename.current) {
            focusAfterRename.current = false;
            buttonRef.current?.focus();
        }
    }, [renaming]);

    const finishRename: NameDone = (name, restoreFocus) => {
        setRenaming(false);
        focusAfterRename.current = restoreFocus;
        // A group always has a name: an empty one keeps the current name.
        if (name !== null && name.trim() !== "" && name.trim() !== group.name) {
            rename.mutate({ group, name });
        }
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "F2" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            setRenaming(true);
        }
    };

    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Translate.toString(transform) }}
            className={cx(
                transition && "transition-transform duration-(--duration-base) ease-standard",
                // While dragged, its slot marks where it will land.
                isDragging &&
                    "relative before:absolute before:inset-x-1 before:top-1/2 before:h-0.5 before:-translate-y-1/2 before:rounded-full before:bg-accent [&>*]:opacity-0"
            )}
        >
            {renaming ? (
                <div className="flex min-h-8 items-center gap-1.5 pl-2.5">
                    <ChevronRight
                        aria-hidden
                        className={cx("size-3.5 shrink-0 text-text-muted", !group.collapsed && "rotate-90")}
                    />
                    <NameField label="Group name" initialValue={group.name} saveOnBlur onDone={finishRename} />
                </div>
            ) : (
                <ContextMenu>
                    <ContextMenuTrigger asChild>
                        <button
                            ref={(node) => {
                                setActivatorNodeRef(node);
                                buttonRef.current = node;
                            }}
                            type="button"
                            aria-expanded={!group.collapsed}
                            aria-controls={group.collapsed ? undefined : listId}
                            // Only the pointer drags a group; the keyboard moves it with "Move up"/"Move down".
                            onPointerDown={(event) => listeners?.onPointerDown?.(event)}
                            onKeyDown={handleKeyDown}
                            onClick={() => setCollapsed.mutate({ group, collapsed: !group.collapsed })}
                            className={cx(
                                "relative flex min-h-8 w-full items-center gap-1.5 rounded-control px-2.5 py-1 text-left",
                                "text-small font-medium text-text-muted transition-colors duration-(--duration-fast) ease-standard",
                                "hover:bg-surface-hover hover:text-text",
                                holdsCurrent &&
                                    "before:absolute before:inset-y-1.5 before:left-0 before:w-0.75 before:rounded-full before:bg-accent",
                                folderOver && "bg-surface-hover text-text"
                            )}
                        >
                            <ChevronRight
                                aria-hidden
                                className={cx(
                                    "size-3.5 shrink-0 transition-transform duration-(--duration-fast) ease-standard",
                                    !group.collapsed && "rotate-90"
                                )}
                            />
                            <span className="line-clamp-2 min-w-0 flex-1 break-words">{group.name}</span>
                            <span aria-hidden className="text-caption text-text-subtle tabular-nums">
                                {count}
                            </span>
                            <span className="sr-only">, {plural(count, "folder")}</span>
                            {held && (
                                <span
                                    aria-hidden
                                    className="absolute inset-x-1.5 bottom-0.5 h-0.5 origin-left animate-hold-fill rounded-full bg-accent motion-reduce:animate-none"
                                    style={{ animationDuration: `${HOLD_TO_DRAG_MS}ms` }}
                                />
                            )}
                        </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent
                        onCloseAutoFocus={(event) => {
                            if (renameChosen.current) {
                                renameChosen.current = false;
                                event.preventDefault();
                                setRenaming(true);
                            }
                        }}
                    >
                        <ContextMenuItem
                            icon={<Pencil />}
                            shortcut="F2"
                            onSelect={() => {
                                renameChosen.current = true;
                            }}
                        >
                            Rename group
                        </ContextMenuItem>
                        {sortable && (
                            <>
                                <ContextMenuItem icon={<ArrowUp />} disabled={!onMoveUp} onSelect={onMoveUp}>
                                    Move up
                                </ContextMenuItem>
                                <ContextMenuItem icon={<ArrowDown />} disabled={!onMoveDown} onSelect={onMoveDown}>
                                    Move down
                                </ContextMenuItem>
                            </>
                        )}
                        <ContextMenuSeparator />
                        <ContextMenuItem
                            icon={<Trash2 />}
                            tone="danger"
                            onSelect={() => (count > 0 ? setDeleteOpen(true) : deleteGroup.mutate(group))}
                        >
                            Delete group
                        </ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>
            )}
            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={`Delete ${group.name}?`}
                description={`Its ${plural(count, "folder")} move out of the group. No folder is removed from the library.`}
                confirmLabel="Delete group"
                tone="danger"
                onConfirm={async () => {
                    await deleteGroup.mutateAsync(group);
                }}
            />
        </div>
    );
}
