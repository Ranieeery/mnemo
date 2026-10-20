import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, FolderSearch, Palette, RefreshCw, Trash2, Unplug } from "lucide-react";
import { useRef, useState } from "react";
import type { LibraryFolder } from "../../../shared/ipc/bindings";
import { useLibraryFolderStatus } from "../../../shared/ipc/queries";
import { cx } from "../../../shared/lib/cx";
import { isWithin } from "../../../shared/lib/paths";
import { openFolderRelocation } from "../../../shared/stores/dialogs";
import { processFolder, useProcessingStore } from "../../../shared/stores/processing";
import {
    ConfirmDialog,
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
    FolderIcon,
    Spinner,
    sidebarItemClasses,
    Tooltip,
    useIsTruncated,
} from "../../../shared/ui";
import { useRemoveLibraryFolder } from "../queries";
import { ChangeIconDialog } from "./ChangeIconDialog";

/** How long a folder must be pressed before it can be dragged, so a click, or a slip of the mouse, never moves it. */
export const HOLD_TO_DRAG_MS = 400;

type LibraryFolderItemProps = {
    folder: LibraryFolder;
    /** Path of the folder being browsed, to highlight the library folder that contains it. */
    currentPath: string | undefined;
    /** Only the icon shows (the collapsed sidebar); the name moves to a tooltip and the status to a corner badge. */
    compact?: boolean;
    /** It can be dragged and moved; off when it is the only folder. Needs a surrounding `SortableContext`. */
    sortable: boolean;
    /** Being pressed: a bar fills while the press lasts, until the folder is picked up. */
    held?: boolean;
    /** Missing at the top (or the bottom) of the list, where the menu item is disabled. */
    onMoveUp?: () => void;
    onMoveDown?: () => void;
};

export function LibraryFolderItem({
    folder,
    currentPath,
    compact = false,
    sortable,
    held = false,
    onMoveUp,
    onMoveDown,
}: LibraryFolderItemProps) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
        id: folder.id,
        disabled: !sortable,
    });
    const navigate = useNavigate();
    const removeFolder = useRemoveLibraryFolder();
    const processing = useProcessingStore((state) =>
        state.status.jobs.some((job) => isWithin(job.folder, folder.path))
    );
    const unavailable = useLibraryFolderStatus(folder.path)?.watch === "unavailable";
    const [iconOpen, setIconOpen] = useState(false);
    const [removeOpen, setRemoveOpen] = useState(false);
    const active = currentPath !== undefined && isWithin(currentPath, folder.path);

    const nameRef = useRef<HTMLSpanElement>(null);
    const nameTruncated = useIsTruncated(nameRef, folder.name);

    const statusIcon = (className?: string) =>
        cx("size-3.5 shrink-0", compact && "absolute top-0.5 right-0.5", className);
    const fullName = unavailable ? `${folder.name} (not connected)` : folder.name;

    return (
        <li
            ref={setNodeRef}
            style={{ transform: CSS.Translate.toString(transform) }}
            className={cx(
                // The motion uses the tokens (zeroed with reduced motion) whenever dnd-kit would animate.
                transition && "transition-transform duration-(--duration-base) ease-standard",
                // While dragged, its slot marks where it will land.
                isDragging &&
                    "relative before:absolute before:inset-x-1 before:top-1/2 before:h-0.5 before:-translate-y-1/2 before:rounded-full before:bg-accent [&>*]:opacity-0"
            )}
        >
            <ContextMenu>
                {/* The rail shows only icons, so it always has the tooltip; the full sidebar only for a cut name. */}
                <Tooltip
                    content={
                        compact ? (
                            fullName
                        ) : (
                            <span className="flex max-w-80 flex-col whitespace-normal">
                                <span className="break-words">{fullName}</span>
                                <span className="text-caption break-all text-text-subtle">{folder.path}</span>
                            </span>
                        )
                    }
                    side="right"
                    disabled={!compact && !nameTruncated}
                >
                    <ContextMenuTrigger asChild>
                        <Link
                            ref={setActivatorNodeRef}
                            to="/folder"
                            search={{ path: folder.path }}
                            aria-current={active ? "page" : undefined}
                            // Only the instructions: dnd-kit's role and tab index would hide that this is a link.
                            aria-describedby={sortable ? attributes["aria-describedby"] : undefined}
                            // The browser's own link dragging would compete with moving the folder.
                            draggable={false}
                            {...listeners}
                            className={cx(
                                "relative flex items-center gap-2.5",
                                compact ? "h-9 w-10 justify-center" : "min-h-9 px-2.5 py-1.5",
                                sidebarItemClasses(active, { subtle: unavailable })
                            )}
                        >
                            {/* A folder not connected keeps its color: the plug and the dimmed name tell its state. */}
                            <FolderIcon name={folder.customIcon} color={folder.iconColor} />
                            {/* Long names wrap to two lines, then end with an ellipsis. */}
                            <span
                                ref={nameRef}
                                className={
                                    compact ? "sr-only" : "line-clamp-2 min-w-0 flex-1 whitespace-normal break-words"
                                }
                                // The tooltip shows the path of a cut name; a native one would show on top of it.
                                title={
                                    compact || nameTruncated
                                        ? undefined
                                        : unavailable
                                          ? `${folder.path} (not connected)`
                                          : folder.path
                                }
                            >
                                {folder.name}
                                {unavailable && <span className="sr-only">, not connected</span>}
                            </span>
                            {unavailable && <Unplug aria-hidden className={statusIcon("text-warning")} />}
                            {processing && (
                                <Spinner label={`Reading videos in ${folder.name}`} className={statusIcon()} />
                            )}
                            {held && (
                                // With reduced motion the bar shows full at once: holding still picks the folder up.
                                <span
                                    aria-hidden
                                    className="absolute inset-x-1.5 bottom-0.5 h-0.5 origin-left animate-hold-fill rounded-full bg-accent motion-reduce:animate-none"
                                    style={{ animationDuration: `${HOLD_TO_DRAG_MS}ms` }}
                                />
                            )}
                        </Link>
                    </ContextMenuTrigger>
                </Tooltip>
                <ContextMenuContent>
                    <ContextMenuItem
                        icon={<RefreshCw />}
                        onSelect={() => processFolder(folder.path, { force: true, report: true })}
                    >
                        Sync folder
                    </ContextMenuItem>
                    {unavailable && (
                        <ContextMenuItem icon={<FolderSearch />} onSelect={() => openFolderRelocation(folder.path)}>
                            Locate folder…
                        </ContextMenuItem>
                    )}
                    <ContextMenuItem icon={<Palette />} onSelect={() => setIconOpen(true)}>
                        Icon and color…
                    </ContextMenuItem>
                    {sortable && (
                        <>
                            <ContextMenuSeparator />
                            <ContextMenuItem icon={<ArrowUp />} disabled={!onMoveUp} onSelect={onMoveUp}>
                                Move up
                            </ContextMenuItem>
                            <ContextMenuItem icon={<ArrowDown />} disabled={!onMoveDown} onSelect={onMoveDown}>
                                Move down
                            </ContextMenuItem>
                        </>
                    )}
                    <ContextMenuSeparator />
                    <ContextMenuItem icon={<Trash2 />} tone="danger" onSelect={() => setRemoveOpen(true)}>
                        Remove from library
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
            {iconOpen && <ChangeIconDialog folder={folder} open={iconOpen} onOpenChange={setIconOpen} />}
            <ConfirmDialog
                open={removeOpen}
                onOpenChange={setRemoveOpen}
                title={`Remove ${folder.name} from the library?`}
                description="Its videos, tags and watch history are removed from Mnemo. Files on disk are not touched."
                confirmLabel="Remove folder"
                tone="danger"
                onConfirm={async () => {
                    await removeFolder.mutateAsync(folder);
                    if (active) {
                        await navigate({ to: "/" });
                    }
                }}
            />
        </li>
    );
}
