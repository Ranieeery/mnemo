import { Check, FolderInput, FolderMinus, FolderPlus } from "lucide-react";
import type { LibraryFolder } from "../../../shared/ipc/bindings";
import { useLibraryLayout } from "../../../shared/ipc/queries";
import {
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
} from "../../../shared/ui";
import { useMoveFolderToGroup } from "../groupQueries";
import { groupsOf } from "../lib/folderLayout";

type MoveToGroupMenuProps = {
    folder: LibraryFolder;
    /** Starts naming a new group for the folder. Runs once the menu is gone, which would take the focus back. */
    onNewGroup: () => void;
};

/** "Move to group": every group (the folder's own marked), a new group, or out of its group. */
export function MoveToGroupMenu({ folder, onNewGroup }: MoveToGroupMenuProps) {
    const groups = groupsOf(useLibraryLayout().data ?? []);
    const move = useMoveFolderToGroup();

    return (
        <ContextMenuSub>
            <ContextMenuSubTrigger icon={<FolderInput />}>Move to group</ContextMenuSubTrigger>
            <ContextMenuSubContent>
                {groups.map((group) => {
                    const current = group.id === folder.groupId;
                    return (
                        <ContextMenuItem
                            key={group.id}
                            icon={current ? <Check /> : <span aria-hidden className="size-4 shrink-0" />}
                            disabled={current}
                            onSelect={() => move.mutate({ folder, group })}
                        >
                            {group.name}
                        </ContextMenuItem>
                    );
                })}
                {groups.length > 0 && <ContextMenuSeparator />}
                <ContextMenuItem icon={<FolderPlus />} onSelect={onNewGroup}>
                    New group…
                </ContextMenuItem>
                {folder.groupId !== null && (
                    <ContextMenuItem icon={<FolderMinus />} onSelect={() => move.mutate({ folder, group: null })}>
                        Remove from group
                    </ContextMenuItem>
                )}
            </ContextMenuSubContent>
        </ContextMenuSub>
    );
}
