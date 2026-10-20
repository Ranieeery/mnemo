import {
    type Announcements,
    closestCenter,
    DndContext,
    DragOverlay,
    KeyboardSensor,
    type Modifier,
    PointerSensor,
    type UniqueIdentifier,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useRef, useState } from "react";
import type { LibraryFolder } from "../../../shared/ipc/bindings";
import { cx } from "../../../shared/lib/cx";
import { FolderIcon } from "../../../shared/ui";
import { useReorderLibraryFolders } from "../queries";
import { HOLD_TO_DRAG_MS, LibraryFolderItem } from "./LibraryFolderItem";

/** `Enter` stays with the link (it opens the folder), so only `Space` picks a folder up. */
const keyboardCodes = { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] };

const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

const screenReaderInstructions = {
    draggable:
        "To move this folder, press Space to pick it up, use the up and down arrow keys to choose its place, and " +
        "press Space again to drop it. Press Escape to cancel.",
};

type SortableFolderListProps = {
    /** In the order they are shown. */
    folders: LibraryFolder[];
    currentPath: string | undefined;
    compact: boolean;
};

/**
 * The library folders, which can be put in another order by dragging them (with the mouse, or picking one up with
 * `Space` and moving it with the arrow keys) or with "Move up"/"Move down". Moving one switches to the custom order,
 * starting from the order on screen.
 */
export function SortableFolderList({ folders, currentPath, compact }: SortableFolderListProps) {
    const reorder = useReorderLibraryFolders();
    const [draggedId, setDraggedId] = useState<UniqueIdentifier | null>(null);
    // The folder being pressed, before the press lasts long enough to pick it up.
    const [heldId, setHeldId] = useState<UniqueIdentifier | null>(null);
    // A picked-up folder is first "over" its own slot; announcing that would cut off the pick-up message.
    const justPickedUp = useRef(false);
    const sensors = useSensors(
        // Moving the pointer more than a few pixels while holding gives up (a click still opens the folder).
        useSensor(PointerSensor, { activationConstraint: { delay: HOLD_TO_DRAG_MS, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes })
    );

    const indexOf = (id: UniqueIdentifier) => folders.findIndex((folder) => folder.id === id);
    const nameOf = (id: UniqueIdentifier) => folders[indexOf(id)]?.name ?? "The folder";
    const positionOf = (id: UniqueIdentifier) => `position ${indexOf(id) + 1} of ${folders.length}`;
    const announcements: Announcements = {
        onDragStart: ({ active }) => {
            justPickedUp.current = true;
            return `Picked up ${nameOf(active.id)}, at ${positionOf(active.id)}.`;
        },
        onDragOver: ({ active, over }) => {
            const firstOver = justPickedUp.current;
            justPickedUp.current = false;
            if (!over) {
                return `${nameOf(active.id)} is outside the list.`;
            }
            return firstOver && over.id === active.id
                ? undefined
                : `${nameOf(active.id)} moved to ${positionOf(over.id)}.`;
        },
        onDragEnd: ({ active, over }) =>
            over ? `${nameOf(active.id)} dropped at ${positionOf(over.id)}.` : `${nameOf(active.id)} was not moved.`,
        onDragCancel: ({ active }) => `Moving cancelled. ${nameOf(active.id)} stays at ${positionOf(active.id)}.`,
    };

    const move = (from: number, to: number) => reorder.mutate(arrayMove(folders, from, to));
    const dragged = folders.find((folder) => folder.id === draggedId);
    const sortable = folders.length > 1;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            accessibility={{ announcements, screenReaderInstructions }}
            onDragPending={({ id }) => setHeldId(id)}
            onDragAbort={() => setHeldId(null)}
            onDragStart={({ active }) => {
                setHeldId(null);
                setDraggedId(active.id);
            }}
            onDragCancel={() => setDraggedId(null)}
            onDragEnd={({ active, over }) => {
                setDraggedId(null);
                if (over && active.id !== over.id) {
                    move(indexOf(active.id), indexOf(over.id));
                }
            }}
        >
            <SortableContext items={folders.map((folder) => folder.id)} strategy={verticalListSortingStrategy}>
                <ul className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
                    {folders.map((folder, index) => (
                        <LibraryFolderItem
                            key={folder.id}
                            folder={folder}
                            currentPath={currentPath}
                            compact={compact}
                            sortable={sortable}
                            held={heldId === folder.id}
                            onMoveUp={index > 0 ? () => move(index, index - 1) : undefined}
                            onMoveDown={index < folders.length - 1 ? () => move(index, index + 1) : undefined}
                        />
                    ))}
                </ul>
            </SortableContext>
            {/* No drop animation: the folder settles into the slot marked in the list. */}
            <DragOverlay dropAnimation={null}>
                {dragged && <DraggedFolder folder={dragged} compact={compact} />}
            </DragOverlay>
        </DndContext>
    );
}

/** The folder lifted under the pointer while it is dragged. */
function DraggedFolder({ folder, compact }: { folder: LibraryFolder; compact: boolean }) {
    return (
        <div
            className={cx(
                "flex cursor-grabbing items-center gap-2.5 rounded-control border border-border-strong bg-surface-raised",
                "text-body text-text shadow-raised",
                compact ? "h-9 w-10 justify-center" : "min-h-9 px-2.5 py-1.5"
            )}
        >
            <FolderIcon name={folder.customIcon} color={folder.iconColor} />
            {!compact && <span className="line-clamp-2 min-w-0 flex-1 break-words">{folder.name}</span>}
        </div>
    );
}
