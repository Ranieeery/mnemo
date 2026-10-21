import { useState } from "react";
import type { ProcessingJob, ProcessingStatus } from "../../../shared/ipc/bindings";
import { useLibraryFolders } from "../../../shared/ipc/queries";
import { folderName } from "../../../shared/lib/folderName";
import { baseName } from "../../../shared/lib/paths";
import { plural } from "../../../shared/lib/plural";
import { cancelProcessing, useProcessingStore } from "../../../shared/stores/processing";
import { Button, Progress } from "../../../shared/ui";
import { ProcessingDetailsDialog } from "./ProcessingDetailsDialog";

/** The background reading of new videos: folders, files being read, progress, failures and cancellation. */
export function ProcessingBar() {
    const status = useProcessingStore((state) => state.status);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [first, ...others] = status.jobs;

    return (
        <>
            {first && (
                <ReadingSummary
                    status={status}
                    first={first}
                    others={others}
                    onShowDetails={() => setDetailsOpen(true)}
                />
            )}
            {/* The details stay open after the last job ends: the files that could not be read are still listed. */}
            {detailsOpen && <ProcessingDetailsDialog onClose={() => setDetailsOpen(false)} />}
        </>
    );
}

type ReadingSummaryProps = {
    status: ProcessingStatus;
    first: ProcessingJob;
    others: ProcessingJob[];
    onShowDetails: () => void;
};

function ReadingSummary({ status, first, others, onShowDetails }: ReadingSummaryProps) {
    const libraryFolders = useLibraryFolders().data;
    const total = status.jobs.reduce((sum, job) => sum + job.total, 0);
    const done = status.jobs.reduce((sum, job) => sum + job.done, 0);
    const failed = status.jobs.reduce((sum, job) => sum + job.failed, 0);
    const listing = status.jobs.some((job) => job.scanning);
    const where =
        others.length > 0
            ? `${folderName(first.folder, libraryFolders)} and ${plural(others.length, "more folder")}`
            : folderName(first.folder, libraryFolders);

    return (
        <div className="flex animate-appear flex-col gap-1.5 border-b border-border px-6 py-2" role="status">
            <div className="flex items-center justify-between gap-4 text-small">
                <span className="min-w-0 truncate text-text-muted">
                    Reading new videos in <span className="text-text">{where}</span>
                    {status.inFlight.length > 0 && (
                        <span className="text-text-subtle">, {status.inFlight.map(baseName).join(", ")}</span>
                    )}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                    <span className="text-text-subtle tabular-nums">
                        {total === 0 && listing ? "Looking for videos…" : `${done} of ${total}`}
                    </span>
                    {failed > 0 && (
                        <Button variant="ghost" size="sm" className="text-warning" onClick={onShowDetails}>
                            {plural(failed, "file")} couldn't be read
                        </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={onShowDetails}>
                        Details
                    </Button>
                    <Button size="sm" disabled={status.cancelling} onClick={() => cancelProcessing()}>
                        {status.cancelling ? "Cancelling…" : "Cancel"}
                    </Button>
                </div>
            </div>
            <Progress label="Reading new videos" value={done} max={Math.max(total, 1)} size="thin" />
        </div>
    );
}
