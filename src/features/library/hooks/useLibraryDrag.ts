import {
    type Active,
    type Announcements,
    closestCenter,
    type DndContextProps,
    KeyboardSensor,
    type Modifier,
    type Over,
    PointerSensor,
    type UniqueIdentifier,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useEffect, useRef, useState } from "react";
import type { LibraryEntry, LibraryGroup } from "../../../shared/ipc/bindings";
import { HOLD_TO_DRAG_MS } from "../components/LibraryFolderItem";
import { arrangementChanged, flatFolders, folderPosition, groupsOf } from "../lib/folderLayout";
import { entriesOf, groupRowId, type LibraryRow, libraryRows, moveRow } from "../lib/libraryRows";
import { useArrangeLibrary } from "../queries";

/** How long a folder must stay over a collapsed group's header for the group to open, so it can be dropped inside. */
export const OPEN_GROUP_DELAY_MS = 500;

/** `Enter` stays with the link (it opens the folder), so only `Space` picks a folder up. */
const keyboardCodes = { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] };

const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

const screenReaderInstructions = {
    draggable:
        "To move this folder, press Space to pick it up, use the up and down arrow keys to choose its place, and " +
        "press Space again to drop it. Press Escape to cancel.",
};

function isGroupRow(item: Active | Over | null): boolean {
    return item?.data.current?.type === "group";
}

/**
 * Dragging folders and groups in the library list (see `libraryRows`). While something is dragged, the list follows
 * it: each move is applied to a copy of the library, so the slot always shows where it lands, inside a group or out
 * of it. A dragged group shows only its header, and a collapsed group opens while a folder is held over its header.
 * Dropping saves the new arrangement (switching to the custom order).
 */
export function useLibraryDrag(entries: LibraryEntry[], compact: boolean) {
    const arrange = useArrangeLibrary();
    const [dragEntries, setDragEntries] = useState<LibraryEntry[] | null>(null);
    const [draggedId, setDraggedId] = useState<UniqueIdentifier | null>(null);
    // The folder or group being pressed, before the press lasts long enough to pick it up.
    const [heldId, setHeldId] = useState<UniqueIdentifier | null>(null);
    // A collapsed group shown open while a folder is dragged over it; it stays collapsed.
    const [openedId, setOpenedId] = useState<number | null>(null);
    const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const sensors = useSensors(
        // Moving the pointer more than a few pixels while holding gives up (a click still opens the folder).
        useSensor(PointerSensor, { activationConstraint: { delay: HOLD_TO_DRAG_MS, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes })
    );
    useEffect(() => () => clearTimeout(openTimer.current), []);

    const shown = dragEntries ?? entries;
    const groups = groupsOf(entries);
    const grouped = groups.length > 0;
    const draggedGroup = groups.find((group) => groupRowId(group.id) === draggedId);
    const draggedFolder =
        typeof draggedId === "number" ? flatFolders(entries).find((folder) => folder.id === draggedId) : undefined;
    const expanded = (group: LibraryGroup) =>
        compact || (group !== draggedGroup && (!group.collapsed || group.id === openedId));
    const rowsOf = (list: readonly LibraryEntry[]): LibraryRow[] =>
        libraryRows(list, { expanded, skipEmptyGroups: compact });
    const rows = rowsOf(shown);
    const moved = (list: readonly LibraryEntry[], active: Active, over: Over) =>
        entriesOf(moveRow(rowsOf(list), active.id, over.id), list);

    const nameOf = (id: UniqueIdentifier) =>
        typeof id === "number"
            ? (flatFolders(entries).find((folder) => folder.id === id)?.name ?? "The folder")
            : `${groups.find((group) => groupRowId(group.id) === id)?.name ?? "The"} group`;
    /** Its position in its list (its group's, or the library's), and the group. */
    const placeOf = (list: readonly LibraryEntry[], id: UniqueIdentifier) => {
        if (typeof id !== "number") {
            const index = list.findIndex((entry) => entry.kind === "group" && groupRowId(entry.group.id) === id);
            return { at: `position ${index + 1} of ${list.length}`, group: null };
        }
        const position = folderPosition(list, id);
        return {
            at: `position ${(position?.index ?? 0) + 1} of ${position?.count ?? 0}`,
            group: position?.group ?? null,
        };
    };
    const describe = (list: readonly LibraryEntry[], id: UniqueIdentifier) => {
        const { at, group } = placeOf(list, id);
        return group ? `${at} in ${group.name}` : at;
    };

    const announcements: Announcements = {
        onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}, at ${describe(entries, active.id)}.`,
        onDragOver: ({ active, over }) => {
            if (!over) {
                return `${nameOf(active.id)} is outside the list.`;
            }
            // Its own slot, once it moved there.
            if (over.id === active.id) {
                return undefined;
            }
            const from = placeOf(shown, active.id).group;
            const { at, group: to } = placeOf(moved(shown, active, over), active.id);
            if (grouped && from?.id !== to?.id) {
                return to
                    ? `${nameOf(active.id)} moved into ${to.name}, ${at}.`
                    : `${nameOf(active.id)} moved out of ${from?.name}, to ${at}.`;
            }
            return `${nameOf(active.id)} moved to ${to ? `${at} in ${to.name}` : at}.`;
        },
        onDragEnd: ({ active, over }) =>
            over
                ? `${nameOf(active.id)} dropped at ${describe(shown, active.id)}.`
                : `${nameOf(active.id)} was not moved.`,
        onDragCancel: ({ active }) =>
            `Moving cancelled. ${nameOf(active.id)} stays at ${describe(entries, active.id)}.`,
    };

    const reset = () => {
        clearTimeout(openTimer.current);
        setDraggedId(null);
        setDragEntries(null);
        setOpenedId(null);
    };

    const dndProps: DndContextProps = {
        sensors,
        collisionDetection: closestCenter,
        modifiers: [restrictToVerticalAxis],
        accessibility: { announcements, screenReaderInstructions },
        onDragPending: ({ id }) => setHeldId(id),
        onDragAbort: () => setHeldId(null),
        onDragStart: ({ active }) => {
            setHeldId(null);
            setDraggedId(active.id);
            setDragEntries(entries);
        },
        onDragOver: ({ active, over }) => {
            // Back over its own slot (where it just moved), a pending opening goes on.
            if (!dragEntries || !over || over.id === active.id) {
                return;
            }
            clearTimeout(openTimer.current);
            const target = rows.find((row) => row.id === over.id);
            if (!isGroupRow(active) && target?.kind === "group" && !target.expanded) {
                openTimer.current = setTimeout(() => setOpenedId(target.group.id), OPEN_GROUP_DELAY_MS);
            }
            setDragEntries(moved(dragEntries, active, over));
        },
        onDragCancel: reset,
        onDragEnd: ({ active, over }) => {
            if (over && dragEntries && arrangementChanged(entries, dragEntries)) {
                arrange.mutate({ entries: dragEntries, moved: isGroupRow(active) ? "group" : "folder" });
            }
            reset();
        },
    };

    return { shown, rows, expanded, dndProps, heldId, draggedFolder, draggedGroup };
}
