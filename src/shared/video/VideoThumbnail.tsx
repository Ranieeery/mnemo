import { convertFileSrc } from "@tauri-apps/api/core";
import { Check, Film } from "lucide-react";
import { useState } from "react";
import { cx } from "../lib/cx";
import { formatDuration } from "../lib/formatDuration";

type VideoThumbnailProps = {
    thumbnailPath: string | null;
    durationSeconds?: number;
    /** Fraction watched (0..1); shown as a strip while the video is in progress. */
    progress?: number;
    watched?: boolean;
    className?: string;
};

/** 16:9 thumbnail with fixed dimensions (no layout shift), lazy loading and a placeholder when missing. */
export function VideoThumbnail({
    thumbnailPath,
    durationSeconds,
    progress = 0,
    watched = false,
    className,
}: VideoThumbnailProps) {
    const [failed, setFailed] = useState(false);
    const showImage = thumbnailPath !== null && !failed;
    const inProgress = !watched && progress > 0 && progress < 1;

    return (
        <div className={cx("relative aspect-video w-full overflow-hidden rounded-card bg-surface-raised", className)}>
            {showImage ? (
                <img
                    src={convertFileSrc(thumbnailPath)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={() => setFailed(true)}
                    className={cx(
                        "size-full object-cover transition-opacity duration-(--duration-base) ease-standard",
                        watched && "opacity-55"
                    )}
                />
            ) : (
                <div className="flex size-full items-center justify-center">
                    <Film className="size-8 text-text-subtle" strokeWidth={1.5} aria-hidden />
                </div>
            )}
            {watched && (
                <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-success text-success-foreground">
                    <Check className="size-3.5" strokeWidth={3} aria-label="Watched" />
                </span>
            )}
            {durationSeconds !== undefined && durationSeconds > 0 && (
                <span className="absolute right-2 bottom-2 rounded-badge bg-scrim px-1.5 py-0.5 text-caption font-medium text-text tabular-nums">
                    {formatDuration(durationSeconds)}
                </span>
            )}
            {inProgress && (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-scrim">
                    <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
                </div>
            )}
        </div>
    );
}
