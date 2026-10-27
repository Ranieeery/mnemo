import { useEffect, useRef } from "react";
import { MAX_UP_NEXT_WIDTH, MIN_UP_NEXT_WIDTH, type VideoEntry } from "../../../shared/ipc/bindings";
import { ResizablePanel, ScrollContainer, VirtualList } from "../../../shared/ui";
import { playerPreferences, usePlayerStore } from "../store";
import { PlaylistItem } from "./PlaylistItem";

type PlaylistPanelProps = {
    /** The whole playlist, in playback order. */
    entries: readonly VideoEntry[];
    /** Position of the video playing now in `entries`, or -1 while it is not known. */
    position: number;
    /** Name of the folder the playlist comes from. */
    folderName: string;
    onSelect: (entry: VideoEntry) => void;
    /** Below the video in theater mode, the list scrolls with the page instead of on its own. */
    scrollsWithPage?: boolean;
};

/**
 * The playlist around the video playing now: what came before (watched ones marked), the current one and what comes
 * next. Opened beside the video, it scrolls to the current one; below it (theater mode) it does not, so the video
 * stays in view.
 */
export function PlaylistPanel({
    entries,
    position,
    folderName,
    onSelect,
    scrollsWithPage = false,
}: PlaylistPanelProps) {
    const width = usePlayerStore((state) => state.upNextWidth);
    const listRef = useRef<HTMLDivElement>(null);
    const currentPath = entries[position]?.path;

    useEffect(() => {
        if (!scrollsWithPage && currentPath) {
            listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "center" });
        }
    }, [currentPath, scrollsWithPage]);

    const list = (
        <div ref={listRef}>
            <VirtualList
                items={entries}
                getKey={(entry) => entry.path}
                estimateSize={() => 76}
                // The current video stays rendered, so a long list can scroll to it.
                keepMounted={position === -1 ? undefined : position}
                renderItem={(entry) => (
                    <PlaylistItem entry={entry} current={entry.path === currentPath} onSelect={onSelect} />
                )}
            />
            {position !== -1 && position === entries.length - 1 && (
                <p className="px-4 py-4 text-small text-text-muted">This is the last video of the playlist.</p>
            )}
        </div>
    );

    return (
        // Follows the window until the user drags its edge; never more than half the window either way. The width
        // is saved with the player preferences, and double-clicking the edge goes back to the automatic width.
        <ResizablePanel
            side="right"
            width={width}
            minWidth={MIN_UP_NEXT_WIDTH}
            maxWidth={MAX_UP_NEXT_WIDTH}
            maxViewportFraction={1 / 2}
            onWidthChange={playerPreferences.setUpNextWidth}
            onReset={() => playerPreferences.setUpNextWidth(null)}
            resizeLabel="Resize playlist"
            autoWidthClassName="w-[clamp(16rem,25vw,28rem)]"
            aria-label="Playlist"
            className="relative flex max-w-[50vw] min-w-60 shrink-0 flex-col border-l border-transparent bg-surface"
        >
            <header className="flex items-baseline justify-between gap-2 px-4 py-3">
                <h2 className="min-w-0 truncate text-body font-semibold text-text" title={folderName}>
                    {folderName}
                </h2>
                {position !== -1 && (
                    <span className="shrink-0 text-small text-text-subtle tabular-nums">
                        {position + 1} of {entries.length}
                    </span>
                )}
            </header>
            {scrollsWithPage ? list : <ScrollContainer className="flex-1">{list}</ScrollContainer>}
        </ResizablePanel>
    );
}
