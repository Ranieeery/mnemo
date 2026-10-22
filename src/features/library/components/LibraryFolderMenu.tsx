import {
    ArrowDown,
    ArrowUp,
    FolderSearch,
    Palette,
    Pencil,
    Pin,
    PinOff,
    RefreshCw,
    RotateCcw,
    Trash2,
} from "lucide-react";
import { useRef } from "react";
import type { LibraryFolder } from "../../../shared/ipc/bindings";
import { openFolderRelocation } from "../../../shared/stores/dialogs";
import { processFolder } from "../../../shared/stores/processing";
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "../../../shared/ui";
import { useFolderVisibilityItem } from "../../../shared/video";
import { MoveToGroupMenu } from "./MoveToGroupMenu";
import { useNewGroup } from "./NewGroupContext";

type LibraryFolderMenuProps = {
    folder: LibraryFolder;
    unavailable: boolean;
    /** Offers "Move up" and "Move down"; each is disabled when missing (at the top or the bottom). */
    sortable: boolean;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    /** Why "Move up" (or "Move down") is disabled at the edge of the pinned folders. */
    moveUpReason?: string;
    moveDownReason?: string;
    onTogglePin: () => void;
    onRename: () => void;
    onResetName: () => void;
    onChangeIcon: () => void;
    onRemove: () => void;
};

/** The context menu of a library folder in the sidebar and the rail. */
export function LibraryFolderMenu({
    folder,
    unavailable,
    sortable,
    onMoveUp,
    onMoveDown,
    moveUpReason,
    moveDownReason,
    onTogglePin,
    onRename,
    onResetName,
    onChangeIcon,
    onRemove,
}: LibraryFolderMenuProps) {
    const visibilityItem = useFolderVisibilityItem(folder);
    const newGroup = useNewGroup();
    // A name field (renaming, or a new group) opens once the menu is gone: while the menu is open it holds the focus
    // (it pulls the focus back from a field opened next to it, which closes the rail's popover), and once closed it
    // gives it to the folder.
    const afterClose = useRef<(() => void) | null>(null);

    return (
        <ContextMenuContent
            onCloseAutoFocus={(event) => {
                const action = afterClose.current;
                if (action) {
                    afterClose.current = null;
                    event.preventDefault();
                    action();
                }
            }}
        >
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
            <ContextMenuItem
                icon={<Pencil />}
                shortcut="F2"
                onSelect={() => {
                    afterClose.current = onRename;
                }}
            >
                Rename
            </ContextMenuItem>
            {folder.customName && (
                <ContextMenuItem icon={<RotateCcw />} onSelect={onResetName}>
                    Reset to folder name
                </ContextMenuItem>
            )}
            <ContextMenuItem icon={<Palette />} onSelect={onChangeIcon}>
                Icon and color…
            </ContextMenuItem>
            <ContextMenuItem icon={folder.pinned ? <PinOff /> : <Pin />} onSelect={onTogglePin}>
                {folder.pinned ? "Unpin" : "Pin"}
            </ContextMenuItem>
            <MoveToGroupMenu
                folder={folder}
                onNewGroup={() => {
                    afterClose.current = () => newGroup.start(folder);
                }}
            />
            <ContextMenuItem
                icon={visibilityItem.icon}
                disabled={visibilityItem.disabled}
                onSelect={visibilityItem.onSelect}
            >
                {visibilityItem.label}
            </ContextMenuItem>
            {sortable && (
                <>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        icon={<ArrowUp />}
                        disabled={!onMoveUp}
                        disabledReason={moveUpReason}
                        onSelect={onMoveUp}
                    >
                        Move up
                    </ContextMenuItem>
                    <ContextMenuItem
                        icon={<ArrowDown />}
                        disabled={!onMoveDown}
                        disabledReason={moveDownReason}
                        onSelect={onMoveDown}
                    >
                        Move down
                    </ContextMenuItem>
                </>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem icon={<Trash2 />} tone="danger" onSelect={onRemove}>
                Remove from library
            </ContextMenuItem>
        </ContextMenuContent>
    );
}
