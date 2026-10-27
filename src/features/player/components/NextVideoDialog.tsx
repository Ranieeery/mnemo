import { useEffect, useId, useRef, useState } from "react";
import type { VideoEntry } from "../../../shared/ipc/bindings";
import { cx } from "../../../shared/lib/cx";
import { Button, Dialog } from "../../../shared/ui";
import { entryTitle, VideoThumbnail } from "../../../shared/video";

/** Seconds before the next video starts on its own. */
const NEXT_VIDEO_COUNTDOWN = 5;

type NextVideoDialogProps = {
    next: VideoEntry;
    /** A card over the video instead of a dialog, for the mini player's small window. */
    compact?: boolean;
    onPlay: () => void;
    onCancel: () => void;
};

/** Shown when a video ends: plays the next one after a countdown unless cancelled. */
export function NextVideoDialog({ next, compact = false, onPlay, onCancel }: NextVideoDialogProps) {
    const [remaining, setRemaining] = useState(NEXT_VIDEO_COUNTDOWN);
    const latestOnPlay = useRef(onPlay);
    latestOnPlay.current = onPlay;

    // One tick at a time, so the countdown stops at zero and plays the next video once, however long navigating takes.
    useEffect(() => {
        if (remaining <= 0) {
            latestOnPlay.current();
            return;
        }
        const timer = window.setTimeout(() => setRemaining((seconds) => seconds - 1), 1000);
        return () => window.clearTimeout(timer);
    }, [remaining]);

    const title = `Up next in ${remaining}s`;
    if (compact) {
        return <NextVideoCard title={title} next={next} onPlay={onPlay} onCancel={onCancel} />;
    }
    return (
        <Dialog
            open
            onOpenChange={(open) => !open && onCancel()}
            title={title}
            description={
                <div className="flex items-center gap-3 pt-2">
                    <NextThumbnail next={next} className="w-36" />
                    <span className="line-clamp-3 font-medium break-words text-text">{entryTitle(next)}</span>
                </div>
            }
            size="sm"
            footer={
                <>
                    <Button variant="ghost" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={onPlay} autoFocus>
                        Play now
                    </Button>
                </>
            }
        />
    );
}

/** The next video's picture beside its title. Decorative: the title already names it. */
function NextThumbnail({ next, className }: { next: VideoEntry; className: string }) {
    return (
        <div aria-hidden className={cx("shrink-0", className)}>
            <VideoThumbnail
                thumbnailPath={next.video?.thumbnailPath ?? null}
                durationSeconds={next.video?.durationSeconds}
                className="w-full rounded-control"
            />
        </div>
    );
}

type NextVideoCardProps = { title: string; next: VideoEntry; onPlay: () => void; onCancel: () => void };

/**
 * The countdown as a small card at the bottom of the mini player. It is a (non-modal) dialog, so the player's keys
 * wait while it is open; `Esc` cancels it, as it does the full dialog.
 */
function NextVideoCard({ title, next, onPlay, onCancel }: NextVideoCardProps) {
    const titleId = useId();
    const latestOnCancel = useRef(onCancel);
    latestOnCancel.current = onCancel;

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !event.defaultPrevented) {
                event.preventDefault();
                latestOnCancel.current();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    return (
        <div
            role="dialog"
            aria-labelledby={titleId}
            className="fixed inset-x-2 bottom-2 flex animate-appear items-center gap-2 rounded-card bg-surface-raised p-2 shadow-overlay"
        >
            <NextThumbnail next={next} className="w-20" />
            <div className="min-w-0 flex-1">
                <p id={titleId} className="text-small font-semibold text-text">
                    {title}
                </p>
                <p className="truncate text-caption text-text-muted">{entryTitle(next)}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onCancel}>
                Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={onPlay} autoFocus>
                Play now
            </Button>
        </div>
    );
}
