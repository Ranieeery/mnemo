import { TriangleAlert } from "lucide-react";
import { useMediaTools } from "../../../shared/ipc/queries";
import { Button, Kbd } from "../../../shared/ui";

function installCommand(): string {
    const platform = navigator.userAgent;
    if (platform.includes("Windows")) {
        return "winget install Gyan.FFmpeg";
    }
    if (platform.includes("Mac")) {
        return "brew install ffmpeg";
    }
    return "sudo apt install ffmpeg";
}

/**
 * Explains how to install ffmpeg when it is missing. Browsing still works without it; new videos just cannot be
 * read (no duration, no thumbnail) until it is installed.
 */
export function MediaToolsNotice() {
    const tools = useMediaTools();
    if (!tools.data || (tools.data.ffmpeg && tools.data.ffprobe)) {
        return null;
    }
    const missing = [!tools.data.ffmpeg && "ffmpeg", !tools.data.ffprobe && "ffprobe"].filter(Boolean).join(" and ");

    return (
        <div role="alert" className="flex items-start gap-3 border-b border-border bg-surface px-6 py-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col gap-1 text-small">
                <p className="font-medium text-text">New videos can't be read: {missing} is not installed.</p>
                <p className="text-text-muted">
                    Install it, make sure it is on the PATH, then check again. For example:{" "}
                    <Kbd>{installCommand()}</Kbd>
                </p>
            </div>
            <Button size="sm" loading={tools.isFetching} onClick={() => tools.refetch()}>
                Check again
            </Button>
        </div>
    );
}
