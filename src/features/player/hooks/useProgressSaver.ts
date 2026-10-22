import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import type { Video } from "../../../shared/ipc/bindings";
import { errorMessage } from "../../../shared/ipc/client";
import { toast } from "../../../shared/ui";
import { ProgressSaver } from "../lib/progress";
import { saveProgress } from "../queries";

/** One saver per video; failures are reported once, not every few seconds. */
export function useProgressSaver(video: Video | null) {
    const queryClient = useQueryClient();
    // Saves follow the record: it appears once an unread video is read, and changes after each save or toggle.
    const latest = useRef(video);
    latest.current = video;
    return useMemo(() => {
        let reported = false;
        return new ProgressSaver((positionSeconds, finished) => {
            const current = latest.current;
            if (!current) {
                return;
            }
            saveProgress(queryClient, current, positionSeconds, finished).catch((error: unknown) => {
                if (!reported) {
                    reported = true;
                    toast({
                        title: "Could not save your progress",
                        description: errorMessage(error),
                        tone: "danger",
                    });
                }
            });
        });
    }, [queryClient]);
}
