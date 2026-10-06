import { FolderOpen, X } from "lucide-react";
import { baseName } from "../../../shared/lib/paths";
import { cancelProcessing, useProcessingStore } from "../../../shared/stores/processing";
import { Button, Dialog, IconButton, Progress } from "../../../shared/ui";
import { showInFileManager } from "../../../shared/video";

type ProcessingDetailsDialogProps = {
    onClose: () => void;
};

/** Each folder being read, with its own progress and cancel button, and the files that could not be read. */
export function ProcessingDetailsDialog({ onClose }: ProcessingDetailsDialogProps) {
    const { jobs, errors } = useProcessingStore((state) => state.status);

    return (
        <Dialog
            open
            onOpenChange={(open) => !open && onClose()}
            title="Reading new videos"
            description="Videos are read a few at a time. Cancelled folders are read again the next time you open them."
            footer={
                <Button variant="primary" onClick={onClose}>
                    Close
                </Button>
            }
        >
            <div className="flex flex-col gap-6 pb-2">
                <section aria-label="Folders" className="flex flex-col gap-1">
                    {jobs.length === 0 ? (
                        <p className="text-small text-text-muted">Nothing left to read.</p>
                    ) : (
                        <ul className="flex flex-col divide-y divide-border">
                            {jobs.map((job) => (
                                <li key={job.folder} className="flex items-center gap-3 py-2.5">
                                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                        <div className="flex items-baseline justify-between gap-3 text-small">
                                            <span className="truncate text-text" title={job.folder}>
                                                {baseName(job.folder)}
                                            </span>
                                            <span className="shrink-0 text-text-subtle tabular-nums">
                                                {job.scanning ? "Looking for videos…" : `${job.done} of ${job.total}`}
                                            </span>
                                        </div>
                                        <Progress
                                            label={`Reading ${baseName(job.folder)}`}
                                            value={job.done}
                                            max={Math.max(job.total, 1)}
                                            size="thin"
                                        />
                                    </div>
                                    <IconButton
                                        label={`Cancel reading ${baseName(job.folder)}`}
                                        icon={<X />}
                                        size="sm"
                                        onClick={() => cancelProcessing(job.folder)}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
                {errors.length > 0 && (
                    <section aria-labelledby="processing-errors" className="flex flex-col gap-2">
                        <h3 id="processing-errors" className="text-small font-semibold text-text">
                            Couldn't be read
                        </h3>
                        <ul className="flex max-h-60 flex-col divide-y divide-border overflow-y-auto rounded-card border border-border">
                            {errors.map((error) => (
                                <li key={error.path} className="flex items-start gap-3 px-3 py-2">
                                    <div className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-small text-text" title={error.path}>
                                            {baseName(error.path)}
                                        </span>
                                        <span className="text-caption text-text-subtle">{error.message}</span>
                                    </div>
                                    <IconButton
                                        label={`Show ${baseName(error.path)} in file manager`}
                                        icon={<FolderOpen />}
                                        size="sm"
                                        onClick={() => showInFileManager(error.path)}
                                    />
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>
        </Dialog>
    );
}
