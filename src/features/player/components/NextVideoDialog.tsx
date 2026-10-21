import { useEffect, useRef, useState } from "react";
import type { VideoEntry } from "../../../shared/ipc/bindings";
import { Button, Dialog } from "../../../shared/ui";
import { entryTitle } from "../../../shared/video";

/** Seconds before the next video starts on its own. */
const NEXT_VIDEO_COUNTDOWN = 5;

type NextVideoDialogProps = {
    next: VideoEntry;
    onPlay: () => void;
    onCancel: () => void;
};

/** Shown when a video ends: plays the next one after a countdown unless cancelled. */
export function NextVideoDialog({ next, onPlay, onCancel }: NextVideoDialogProps) {
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

    return (
        <Dialog
            open
            onOpenChange={(open) => !open && onCancel()}
            title={`Up next in ${remaining}s`}
            description={entryTitle(next)}
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
