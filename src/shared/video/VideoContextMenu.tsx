import { Circle, CircleCheck, ExternalLink, FolderOpen, PencilLine, Play } from "lucide-react";
import type { ReactElement } from "react";
import type { VideoEntry } from "../ipc/bindings";
import { openVideoDetails } from "../stores/dialogs";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "../ui";
import { entryTitle } from "./entry";
import { openInDefaultPlayer, showInFileManager, usePlayVideo, useSetWatched } from "./useVideoActions";

type VideoContextMenuProps = {
    entry: VideoEntry;
    /** The element that opens the menu on right-click (or Shift+F10). Must accept a ref. */
    children: ReactElement;
};

export function VideoContextMenu({ entry, children }: VideoContextMenuProps) {
    const setWatched = useSetWatched();
    const playVideo = usePlayVideo();
    const { video } = entry;

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuLabel>{entryTitle(entry)}</ContextMenuLabel>
                <ContextMenuItem icon={<Play />} onSelect={() => playVideo(entry)}>
                    Play
                </ContextMenuItem>
                {video && (
                    <ContextMenuItem
                        icon={video.isWatched ? <Circle /> : <CircleCheck />}
                        onSelect={() => setWatched.mutate({ video, watched: !video.isWatched })}
                    >
                        {video.isWatched ? "Mark as unwatched" : "Mark as watched"}
                    </ContextMenuItem>
                )}
                {video && (
                    <ContextMenuItem icon={<PencilLine />} onSelect={() => openVideoDetails(video)}>
                        Edit details and tags
                    </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem icon={<ExternalLink />} onSelect={() => openInDefaultPlayer(entry.path)}>
                    Open in default player
                </ContextMenuItem>
                <ContextMenuItem icon={<FolderOpen />} onSelect={() => showInFileManager(entry.path)}>
                    Show in file manager
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}
