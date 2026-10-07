import { open, save } from "@tauri-apps/plugin-dialog";
import { Download, RefreshCw, RotateCcw, Upload } from "lucide-react";
import { type ReactNode, useState } from "react";
import { errorMessage } from "../../../shared/ipc/client";
import { useLibraryFolders } from "../../../shared/ipc/queries";
import { formatDuration } from "../../../shared/lib/formatDuration";
import { syncFolders } from "../../../shared/stores/processing";
import { Button, Card, ConfirmDialog, ErrorState, Skeleton, Switch, toast } from "../../../shared/ui";
import {
    useAppSettings,
    useExportLibrary,
    useImportLibrary,
    useLibraryStats,
    useResetWatchStatus,
    useUpdateSettings,
} from "../queries";
import { SettingRow } from "./SettingRow";

function Stat({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="flex flex-col gap-1 rounded-card border border-border bg-surface px-4 py-3">
            <span className="text-small text-text-muted">{label}</span>
            <span className="text-heading font-semibold text-text tabular-nums">{value}</span>
        </div>
    );
}

function LibraryStatsGrid() {
    const stats = useLibraryStats();
    if (stats.isPending) {
        return <Skeleton className="h-20 w-full" />;
    }
    if (stats.isError) {
        return (
            <ErrorState
                title="Could not load the statistics"
                message={errorMessage(stats.error)}
                onRetry={() => stats.refetch()}
            />
        );
    }
    const { totalVideos, watchedVideos, totalDurationSeconds, totalFolders, totalTags } = stats.data;
    const percent = totalVideos > 0 ? Math.round((watchedVideos / totalVideos) * 100) : 0;
    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
            <Stat label="Videos" value={totalVideos} />
            <Stat label="Watched" value={`${watchedVideos} (${percent}%)`} />
            <Stat label="Total duration" value={formatDuration(totalDurationSeconds)} />
            <Stat label="Folders" value={totalFolders} />
            <Stat label="Tags" value={totalTags} />
        </div>
    );
}

/** Whether changes in the library folders are followed as they happen. */
function WatchFoldersSwitch() {
    const settings = useAppSettings();
    const updateSettings = useUpdateSettings();
    if (!settings.data) {
        return null;
    }
    const current = settings.data;
    return (
        <div className="px-5 py-4">
            <Switch
                label="Watch folders for changes"
                description="New, renamed, moved and deleted videos show up as they happen. When off, folders are checked when Mnemo starts and when you sync."
                checked={current.watchFolders}
                disabled={updateSettings.isPending}
                onCheckedChange={(watchFolders) => updateSettings.mutate({ ...current, watchFolders })}
            />
        </div>
    );
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

/** Library statistics, folders, backups and the bulk maintenance of watch status. */
export function LibraryTab({ foldersPanel }: { foldersPanel: ReactNode }) {
    const folders = useLibraryFolders();
    const exportLibrary = useExportLibrary();
    const importLibrary = useImportLibrary();
    const resetWatchStatus = useResetWatchStatus();
    const [importPath, setImportPath] = useState<string | null>(null);
    const [resetOpen, setResetOpen] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const exportToFile = async () => {
        const path = await save({
            defaultPath: `mnemo-library-${today()}.json`,
            filters: [{ name: "Mnemo library", extensions: ["json"] }],
        });
        if (path) {
            exportLibrary.mutate(path);
        }
    };

    const chooseImport = async () => {
        const path = await open({ multiple: false, filters: [{ name: "Mnemo library", extensions: ["json"] }] });
        if (typeof path === "string") {
            setImportPath(path);
        }
    };

    const syncAll = async () => {
        setSyncing(true);
        try {
            const { processed, failed } = await syncFolders((folders.data ?? []).map((folder) => folder.path));
            toast({
                title: processed > 0 ? `Added ${processed} new videos` : "The library is up to date",
                description: failed > 0 ? `${failed} files could not be read.` : undefined,
                tone: "success",
            });
        } catch (error) {
            toast({ title: "Could not sync the library", description: errorMessage(error), tone: "danger" });
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <LibraryStatsGrid />
            {foldersPanel}
            <Card className="divide-y divide-border">
                <WatchFoldersSwitch />
                <SettingRow
                    title="Sync library"
                    description="Look for new, renamed, moved and deleted videos in every library folder now."
                >
                    <Button
                        icon={<RefreshCw />}
                        loading={syncing}
                        disabled={(folders.data?.length ?? 0) === 0}
                        onClick={syncAll}
                    >
                        Sync library
                    </Button>
                </SettingRow>
                <SettingRow
                    title="Export library"
                    description="Save folders, titles, descriptions, tags, watch status and settings to a JSON file."
                >
                    <Button icon={<Download />} loading={exportLibrary.isPending} onClick={exportToFile}>
                        Export
                    </Button>
                </SettingRow>
                <SettingRow
                    title="Import library"
                    description="Replace the library with an export, including exports from older versions of Mnemo."
                >
                    <Button icon={<Upload />} loading={importLibrary.isPending} onClick={chooseImport}>
                        Import
                    </Button>
                </SettingRow>
                <SettingRow title="Reset watch status" description="Mark every video as unwatched. Tags are kept.">
                    <Button variant="danger" icon={<RotateCcw />} onClick={() => setResetOpen(true)}>
                        Reset
                    </Button>
                </SettingRow>
            </Card>

            <ConfirmDialog
                open={importPath !== null}
                onOpenChange={(open) => !open && setImportPath(null)}
                title="Replace your library with this file?"
                description={`Everything in the current library is replaced by the contents of ${importPath ?? "the file"}. If the file is invalid, nothing changes.`}
                confirmLabel="Replace library"
                tone="danger"
                onConfirm={async () => {
                    if (importPath) {
                        await importLibrary.mutateAsync(importPath);
                    }
                }}
            />
            <ConfirmDialog
                open={resetOpen}
                onOpenChange={setResetOpen}
                title="Mark every video as unwatched?"
                description="Watch status and progress of every video are cleared. Tags stay as they are."
                confirmLabel="Reset watch status"
                tone="danger"
                onConfirm={async () => {
                    await resetWatchStatus.mutateAsync();
                }}
            />
        </div>
    );
}
