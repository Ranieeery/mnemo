import { AudioLines, ExternalLink } from "lucide-react";
import type { AudioTrack } from "../../../shared/ipc/bindings";
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
} from "../../../shared/ui";
import { openInDefaultPlayer } from "../../../shared/video";
import type { AudioTracksState } from "../hooks/useAudioTracks";
import { audioFormatsOf, audioTrackLabel } from "../lib/tracks";

type AudioTrackMenuProps = {
    path: string;
    audio: AudioTracksState;
};

const problemMessages: Record<NonNullable<AudioTracksState["problem"]>, (tracks: AudioTrack[]) => string> = {
    "no-switching": () => "This player can't switch audio tracks. The default player can.",
    "no-playable-audio": (tracks) =>
        `This player can't play ${audioFormatsOf(tracks)} audio, so the video has no sound here. The default player can.`,
    unmatched: () => "The tracks of this file could not be told apart here. The default player can switch them.",
};

/** Switches between the audio tracks of the file, when there is more than one. */
export function AudioTrackMenu({ path, audio }: AudioTrackMenuProps) {
    if (audio.tracks.length < 2) {
        return null;
    }
    const someUnavailable = audio.tracks.some((entry) => entry.playerIndex === null);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <IconButton label="Audio track" icon={<AudioLines />} variant="overlay" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="max-w-80">
                <DropdownMenuLabel>Audio track</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={audio.selected === null ? "" : String(audio.selected)}
                    onValueChange={(value) => audio.select(Number(value))}
                >
                    {audio.tracks.map(({ track, playerIndex }) => (
                        <DropdownMenuRadioItem
                            key={track.index}
                            value={String(track.index)}
                            disabled={playerIndex === null}
                            className="h-auto min-h-8 py-1.5"
                        >
                            <span className="flex min-w-0 flex-col">
                                <span className="truncate">{audioTrackLabel(track)}</span>
                                {audio.problem !== "no-switching" &&
                                    audio.problem !== "unmatched" &&
                                    playerIndex === null && (
                                        <span className="text-caption text-text-subtle">Format not supported here</span>
                                    )}
                            </span>
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
                {audio.problem && (
                    <p className="max-w-72 px-2 py-1.5 text-caption text-text-subtle">
                        {problemMessages[audio.problem](audio.tracks.map((entry) => entry.track))}
                    </p>
                )}
                {someUnavailable && (
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
