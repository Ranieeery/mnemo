import { Circle, CircleCheck, Ellipsis, Info, Tag, TagsIcon } from "lucide-react";
import { Fragment, type ReactElement, type ReactNode, useState } from "react";
import type { FolderSummary } from "../../../shared/ipc/bindings";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuTrigger,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    IconButton,
} from "../../../shared/ui";
import { useFolderSummary } from "../queries";
import type { FolderAction, FolderTarget } from "./FolderActionDialog";

type ActionItem = {
    action: FolderAction;
    label: string;
    icon: ReactNode;
    tone?: "danger";
    disabled: boolean;
    separatorBefore?: boolean;
};

/** Folder actions with their availability; everything is disabled until the counts are known. */
function folderActionItems(summary: FolderSummary | undefined): ActionItem[] {
    const total = summary?.totalVideos ?? 0;
    const watched = summary?.watchedVideos ?? 0;
    return [
        { action: "markWatched", label: "Mark all as watched", icon: <CircleCheck />, disabled: watched >= total },
        { action: "markUnwatched", label: "Mark all as unwatched", icon: <Circle />, disabled: watched === 0 },
        {
            action: "addTag",
            label: "Add tag to all videos",
            icon: <Tag />,
            disabled: total === 0,
            separatorBefore: true,
        },
        {
            action: "removeTags",
            label: "Remove all tags",
            icon: <TagsIcon />,
            tone: "danger",
            disabled: (summary?.taggedVideos ?? 0) === 0,
        },
        { action: "properties", label: "Properties", icon: <Info />, disabled: !summary, separatorBefore: true },
    ];
}

type MenuProps = {
    target: FolderTarget;
    onAction: (action: FolderAction, target: FolderTarget, summary: FolderSummary) => void;
};

/** Right-click menu of a folder card. Counts load when the menu opens. */
export function FolderContextMenu({ target, onAction, children }: MenuProps & { children: ReactElement }) {
    const [open, setOpen] = useState(false);
    const summary = useFolderSummary(target.path, open);

    return (
        <ContextMenu onOpenChange={setOpen}>
            <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuLabel>{target.name}</ContextMenuLabel>
                {folderActionItems(summary.data).map((item) => (
                    <Fragment key={item.action}>
                        {item.separatorBefore && <ContextMenuSeparator />}
                        <ContextMenuItem
                            icon={item.icon}
                            tone={item.tone}
                            disabled={item.disabled}
                            onSelect={() => summary.data && onAction(item.action, target, summary.data)}
                        >
                            {item.label}
                        </ContextMenuItem>
                    </Fragment>
                ))}
            </ContextMenuContent>
        </ContextMenu>
    );
}

/** The same actions for the folder being browsed, from a button in its header. */
export function FolderActionsDropdown({ target, onAction }: MenuProps) {
    const [open, setOpen] = useState(false);
    const summary = useFolderSummary(target.path, open);

    return (
        <DropdownMenu onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <IconButton label="Folder actions" icon={<Ellipsis />} variant="secondary" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>{target.name}</DropdownMenuLabel>
                {folderActionItems(summary.data).map((item) => (
                    <Fragment key={item.action}>
                        {item.separatorBefore && <DropdownMenuSeparator />}
                        <DropdownMenuItem
                            icon={item.icon}
                            tone={item.tone}
                            disabled={item.disabled}
                            onSelect={() => summary.data && onAction(item.action, target, summary.data)}
                        >
                            {item.label}
                        </DropdownMenuItem>
                    </Fragment>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
