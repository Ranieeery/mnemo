import { open, save } from "@tauri-apps/plugin-dialog";
import { Download, RefreshCw, RotateCcw, Upload } from "lucide-react";
import { type ReactNode, useState } from "react";
import { errorMessage } from "../../../shared/ipc/client";
import { useLibraryFolders } from "../../../shared/ipc/queries";
import { dayKey } from "../../../shared/lib/dayKey";
import { formatTotalDuration } from "../../../shared/lib/formatTotalDuration";
import { plural, pluralNoun } from "../../../shared/lib/plural";
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

/** A number set apart from the sentence around it, with thousands separators. */
function Figure({ children }: { children: number | string }) {
    const text = typeof children === "number" ? children.toLocaleString("en-US") : children;
    return <strong className="font-semibold text-text tabular-nums">{text}</strong>;
}

function Count({ value, noun }: { value: number; noun: string }) {
    return (
        <>
            <Figure>{value}</Figure> {pluralNoun(value, noun)}
        </>
    );
}

/** The library in one sentence: "1,296 videos in 8 folders · 440 h 16 min in total · 1 watched (0%) · 0 tags". */
function LibrarySummary() {
    const stats = useLibraryStats();
    if (stats.isPending) {
        return <Skeleton className="h-5 w-96 max-w-full" />;
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
        <p className="text-body text-text-muted">
            <Count value={totalVideos} noun="video" /> in <Count value={totalFolders} noun="folder" />
            {totalVideos > 0 && (
                <>
                    {" · "}
                    <Figure>{formatTotalDuration(totalDurationSeconds)}</Figure> in total ·{" "}
                    <Figure>{watchedVideos}</Figure> watched ({percent}%)
                </>
            )}
            {" · "}
            <Count value={totalTags} noun="tag" />
        </p>
    );
}

/** Whether changes in the library folders are followed as they happen. */
function WatchFoldersSwitch() {
    const settings = useAppSettings();
    const updateSettings = useUpdateSettings();
    if (settings.isPending) {
        return <Skeleton className="mx-5 my-4 h-10" />;
    }
    if (settings.isError) {
        return (
            <ErrorState
                title="Could not load the settings"
                message={errorMessage(settings.error)}
                onRetry={() => settings.refetch()}
            />
        );
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
            defaultPath: `mnemo-library-${dayKey(new Date())}.json`,
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
                title: processed > 0 ? `Added ${plural(processed, "new video")}` : "The library is up to date",
                description: failed > 0 ? `${plural(failed, "file")} could not be read.` : undefined,
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
            <LibrarySummary />
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
