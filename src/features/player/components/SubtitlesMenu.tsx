import { useNavigate } from "@tanstack/react-router";
import { ExternalLink, Palette, Subtitles } from "lucide-react";
import { useKeyboardShortcuts } from "../../../shared/ipc/queries";
import { cx } from "../../../shared/lib/cx";
import { shortcutHint } from "../../../shared/lib/keyboard";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    IconButton,
    Spinner,
} from "../../../shared/ui";
import { openInDefaultPlayer } from "../../../shared/video";
import type { SubtitlesState } from "../hooks/useSubtitles";
import { sourceFromKey, sourceKey, subtitleTrackLabel } from "../lib/tracks";

type SubtitlesMenuProps = {
    path: string;
    subtitles: SubtitlesState;
    enabled: boolean;
};

/** Chooses the subtitles shown: off, the file next to the video, or a track inside it. */
export function SubtitlesMenu({ path, subtitles, enabled }: SubtitlesMenuProps) {
    const { tracks, tracksStatus, hasFile, active, extracting, available } = subtitles;
    const hasImageTracks = tracks?.some((track) => !track.isText) ?? false;
    const shortcuts = useKeyboardShortcuts();
    const navigate = useNavigate();

    if (!available && tracksStatus !== "loading" && !hasImageTracks) {
        return <IconButton label="No subtitles for this video" icon={<Subtitles />} variant="overlay" disabled />;
    }

    const shown = enabled && active !== null;
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <IconButton
                    label="Subtitles"
                    shortcut={shortcutHint(shortcuts.subtitles)}
                    icon={extracting !== null ? <Spinner /> : <Subtitles />}
                    variant="overlay"
                    aria-busy={extracting !== null || undefined}
                    className={cx(shown && "bg-surface-hover/60")}
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="max-w-80">
                <DropdownMenuLabel>Subtitles</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={shown ? sourceKey(active) : "off"}
                    onValueChange={(key) => subtitles.choose(sourceFromKey(key))}
                >
                    <DropdownMenuRadioItem value="off">Off</DropdownMenuRadioItem>
                    {hasFile && <DropdownMenuRadioItem value="file">Subtitle file</DropdownMenuRadioItem>}
                    {tracks?.map((track) => (
                        <DropdownMenuRadioItem
                            key={track.index}
                            value={sourceKey({ kind: "embedded", index: track.index })}
                            disabled={!track.isText}
                            className="h-auto min-h-8 py-1.5"
                        >
                            <span className="flex min-w-0 flex-col">
                                <span className="truncate">{subtitleTrackLabel(track)}</span>
                                {!track.isText && (
                                    <span className="text-caption text-text-subtle">
                                        Image subtitles can't be shown here
                                    </span>
                                )}
                            </span>
                            {extracting === track.index && <Spinner className="ml-auto" label="Loading subtitles" />}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
                {tracksStatus === "loading" && (
                    <DropdownMenuItem disabled icon={<Spinner />}>
                        Looking for subtitles in the file…
                    </DropdownMenuItem>
                )}
                {tracksStatus === "error" && (
                    <DropdownMenuItem disabled>Could not read the subtitles inside the file</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    icon={<Palette />}
                    onSelect={() => void navigate({ to: "/settings", search: { tab: "playback" } })}
                >
                    Subtitle style…
                </DropdownMenuItem>
                {hasImageTracks && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem icon={<ExternalLink />} onSelect={() => openInDefaultPlayer(path)}>
                            Open in default player
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
