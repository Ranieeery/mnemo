import { useQuery } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { Eraser } from "lucide-react";
import { useState } from "react";
import type { Video } from "../../../shared/ipc/bindings";
import { errorMessage } from "../../../shared/ipc/client";
import { formatBytes } from "../../../shared/lib/formatBytes";
import { plural } from "../../../shared/lib/plural";
import { Button, Card, ConfirmDialog, ErrorState, Skeleton } from "../../../shared/ui";
import {
    useCleanMissingVideos,
    useCleanOrphanedVideos,
    useDatabaseInfo,
    useMissingVideos,
    useOrphanedVideos,
} from "../queries";
import { SettingRow } from "./SettingRow";
import { UpdatesCard } from "./UpdatesCard";

/** Videos listed before cleaning up. */
const CLEANUP_PREVIEW = 20;

function DatabaseInfoCard() {
    const info = useDatabaseInfo();
    if (info.isPending) {
        return <Skeleton className="h-40 w-full" />;
    }
    if (info.isError) {
        return (
            <ErrorState
                title="Could not read the database"
                message={errorMessage(info.error)}
                onRetry={() => info.refetch()}
            />
        );
    }
    const { path, sizeBytes, schemaVersion } = info.data;
    return (
        <Card className="flex flex-col gap-4 p-5">
            <h3 className="text-body font-medium text-text">Database</h3>
            <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-small">
                <dt className="text-text-muted">File</dt>
                <dd className="break-all text-text">{path}</dd>
                <dt className="text-text-muted">Size</dt>
                <dd className="text-text tabular-nums">{formatBytes(sizeBytes)}</dd>
                <dt className="text-text-muted">Schema version</dt>
                <dd className="text-text tabular-nums">{schemaVersion}</dd>
            </dl>
        </Card>
    );
}

type CleanupCardProps = {
    title: string;
    /** Why the listed videos can be cleaned up, given how many there are. */
    describe: (count: number) => string;
    /** The videos listed before cleaning up; `undefined` until they load. */
    videos: Video[] | undefined;
    pending: boolean;
    /** Cleaned up too, but only counted: videos in folders hidden from the home page and the history. */
    hiddenCount?: number;
    clean: { mutateAsync: () => Promise<unknown> };
    noun: string;
};

/** Videos that can be removed from the library, listed before cleaning them up; the full count is always shown. */
function CleanupCard({ title, describe, videos = [], pending, hiddenCount = 0, clean, noun }: CleanupCardProps) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const count = videos.length + hiddenCount;

    return (
        <Card>
            <SettingRow title={title} description={pending ? "Checking…" : describe(count)}>
                <Button icon={<Eraser />} disabled={count === 0} onClick={() => setConfirmOpen(true)}>
                    Clean up
                </Button>
            </SettingRow>
            {count > 0 && (
                <ul className="flex flex-col gap-1 border-t border-border px-5 py-3 text-small text-text-muted">
                    {videos.slice(0, CLEANUP_PREVIEW).map((video) => (
                        <li key={video.id} className="truncate" title={video.filePath}>
                            {video.filePath}
                        </li>
                    ))}
                    {videos.length > CLEANUP_PREVIEW && (
                        <li className="text-text-subtle">and {videos.length - CLEANUP_PREVIEW} more</li>
                    )}
                    {hiddenCount > 0 && (
                        <li className="text-text-subtle">+ {plural(hiddenCount, "video")} in hidden folders</li>
                    )}
                </ul>
            )}
            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title={`Remove ${plural(count, noun)}?`}
                description="They are removed from the library with their tags, history and thumbnails. Files on disk are not touched."
                confirmLabel="Remove videos"
                tone="danger"
                onConfirm={async () => {
                    await clean.mutateAsync();
                }}
            />
        </Card>
    );
}

function MissingCard() {
    const missing = useMissingVideos();
    return (
        <CleanupCard
            title="Missing videos"
            describe={(count) =>
                `${plural(count, "video")} can no longer be found on disk: deleted, or moved out of the library. They keep their progress and tags in case the files come back, and are removed after 30 days.`
            }
            videos={missing.data?.videos}
            pending={missing.isPending}
            hiddenCount={missing.data?.hiddenCount}
            clean={useCleanMissingVideos()}
            noun="missing video"
        />
    );
}

function OrphansCard() {
    const orphans = useOrphanedVideos();
    return (
        <CleanupCard
            title="Orphaned videos"
            describe={(count) =>
                `${count} ${count === 1 ? "video belongs" : "videos belong"} to no library folder, usually because an older version kept them after their folder was removed.`
            }
            videos={orphans.data}
            pending={orphans.isPending}
            clean={useCleanOrphanedVideos()}
            noun="orphaned video"
        />
    );
}

export function MaintenanceTab() {
    const version = useQuery({ queryKey: ["app-version"], queryFn: getVersion, staleTime: Number.POSITIVE_INFINITY });
    return (
        <div className="flex flex-col gap-6">
            <MissingCard />
            <OrphansCard />
            <DatabaseInfoCard />
            <UpdatesCard />
            <p className="text-small text-text-subtle">Mnemo {version.data ?? ""}</p>
        </div>
    );
}
