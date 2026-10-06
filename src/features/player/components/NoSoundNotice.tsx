import { ExternalLink, VolumeX, X } from "lucide-react";
import { Button, IconButton } from "../../../shared/ui";

type NoSoundNoticeProps = {
    /** The audio formats the player cannot decode, e.g. "E-AC3". */
    formats: string;
    onOpenExternally: () => void;
    onDismiss: () => void;
};

/**
 * Explains, over the video itself, why it plays silently. Stays until dismissed (also in full screen and while the
 * controls are hidden), since a silent video gives no other clue.
 */
export function NoSoundNotice({ formats, onOpenExternally, onDismiss }: NoSoundNoticeProps) {
    return (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
            <div
                role="alert"
                className="pointer-events-auto flex w-full max-w-xl animate-pop-in items-center gap-3 rounded-card border border-warning/40 bg-surface-raised py-2.5 pr-2 pl-4 shadow-overlay"
            >
                <VolumeX className="size-5 shrink-0 text-warning" aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col">
                    <p className="text-body font-medium text-text">No sound in the built-in player</p>
                    <p className="text-small text-text-muted">It can't play {formats} audio. The default player can.</p>
                </div>
                <Button variant="primary" size="sm" icon={<ExternalLink />} onClick={onOpenExternally}>
                    Open in default player
                </Button>
                <IconButton label="Dismiss" icon={<X />} size="sm" onClick={onDismiss} />
            </div>
        </div>
    );
}
