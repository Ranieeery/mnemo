import { useQuery } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { Eraser } from "lucide-react";
import { useState } from "react";
import { errorMessage } from "../../../shared/ipc/client";
import { formatBytes } from "../../../shared/lib/formatBytes";
import { Button, Card, ConfirmDialog, ErrorState, Skeleton } from "../../../shared/ui";
import { useCleanOrphanedVideos, useDatabaseInfo, useOrphanedVideos } from "../queries";
import { SettingRow } from "./SettingRow";

/** Orphaned videos listed before cleaning up; the full count is always shown. */
const ORPHAN_PREVIEW = 20;

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
    const { path, sizeBytes, schemaVersion, tables } = info.data;
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
                {tables.map((table) => (
                    <div key={table.name} className="contents">
                        <dt className="text-text-muted">{table.name}</dt>
                        <dd className="text-text tabular-nums">{table.rows} rows</dd>
                    </div>
                ))}
            </dl>
        </Card>
    );
}

function OrphansCard() {
    const orphans = useOrphanedVideos();
    const clean = useCleanOrphanedVideos();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const count = orphans.data?.length ?? 0;

    return (
        <Card>
            <SettingRow
                title="Orphaned videos"
                description={
                    orphans.isPending
                        ? "Checking..."
                        : `${count} ${count === 1 ? "video belongs" : "videos belong"} to no library folder, usually because an older version kept them after their folder was removed.`
                }
            >
                <Button icon={<Eraser />} disabled={count === 0} onClick={() => setConfirmOpen(true)}>
                    Clean up
                </Button>
            </SettingRow>
            {count > 0 && (
                <ul className="flex flex-col gap-1 border-t border-border px-5 py-3 text-small text-text-muted">
                    {orphans.data?.slice(0, ORPHAN_PREVIEW).map((video) => (
                        <li key={video.id} className="truncate" title={video.filePath}>
                            {video.filePath}
                        </li>
                    ))}
                    {count > ORPHAN_PREVIEW && <li className="text-text-subtle">and {count - ORPHAN_PREVIEW} more</li>}
                </ul>
            )}
            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title={`Remove ${count} orphaned videos?`}
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

export function MaintenanceTab() {
    const version = useQuery({ queryKey: ["app-version"], queryFn: getVersion, staleTime: Number.POSITIVE_INFINITY });
    return (
        <div className="flex flex-col gap-6">
            <OrphansCard />
            <DatabaseInfoCard />
            <p className="text-small text-text-subtle">Mnemo {version.data ?? ""}</p>
        </div>
    );
}
