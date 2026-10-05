import { baseName } from "../../../shared/lib/paths";
import { useProcessingStore } from "../../../shared/stores/processing";
import { Progress } from "../../../shared/ui";

/** Shows the background job reading new videos, with the file being processed. Hidden when idle. */
export function ProcessingBar() {
    const job = useProcessingStore((state) => state.job);
    if (!job) {
        return null;
    }
    return (
        <div className="flex animate-appear flex-col gap-1.5 border-b border-border px-6 py-2" role="status">
            <div className="flex items-baseline justify-between gap-4 text-small">
                <span className="min-w-0 truncate text-text-muted">
                    Reading new videos in <span className="text-text">{baseName(job.folder)}</span>
                    {job.currentFile && <span className="text-text-subtle">, {job.currentFile}</span>}
                </span>
                <span className="shrink-0 text-text-subtle tabular-nums">
                    {job.done} of {job.total}
                </span>
            </div>
            <Progress label="Reading new videos" value={job.done} max={job.total} size="thin" />
        </div>
    );
}
