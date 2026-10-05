import { useEffect, useState } from "react";
import type { VideoEntry } from "../../../shared/ipc/bindings";
import { Button, Dialog } from "../../../shared/ui";
import { entryTitle } from "../../../shared/video";

/** Seconds before the next video starts on its own. */
export const NEXT_VIDEO_COUNTDOWN = 5;

type NextVideoDialogProps = {
    next: VideoEntry;
    onPlay: () => void;
    onCancel: () => void;
};

/** Shown when a video ends: plays the next one after a countdown unless cancelled. */
export function NextVideoDialog({ next, onPlay, onCancel }: NextVideoDialogProps) {
    const [remaining, setRemaining] = useState(NEXT_VIDEO_COUNTDOWN);

    useEffect(() => {
        const timer = window.setInterval(() => setRemaining((seconds) => seconds - 1), 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (remaining <= 0) {
            onPlay();
        }
    }, [remaining, onPlay]);

    return (
        <Dialog
            open
            onOpenChange={(open) => !open && onCancel()}
            title={`Up next in ${Math.max(remaining, 0)}s`}
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
