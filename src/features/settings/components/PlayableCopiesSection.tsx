import { Trash2 } from "lucide-react";
import { useState } from "react";
import {
    MAX_PLAYABLE_COPY_LIMIT_GB,
    MIN_PLAYABLE_COPY_LIMIT_GB,
    type PlayableCopyMode,
} from "../../../shared/ipc/bindings";
import { errorMessage } from "../../../shared/ipc/client";
import { usePlayableCopySettings, useSavePlayableCopySettings } from "../../../shared/ipc/queries";
import { formatBytes } from "../../../shared/lib/formatBytes";
import { Button, Card, ChoiceGroup, ErrorState, Skeleton, Slider } from "../../../shared/ui";
import { useClearPlayableCopies, usePlayableCopiesUsage } from "../queries";
import { SettingRow } from "./SettingRow";

const MODES: readonly { value: PlayableCopyMode; label: string }[] = [
    { value: "ask", label: "Ask" },
    { value: "always", label: "Always" },
    { value: "never", label: "Never" },
];

/**
 * Playable copies: MP4 copies, made without re-encoding, of videos whose container the built-in player can't open.
 * Whether to make them, how much disk they may use, and a way to delete them.
 */
export function PlayableCopiesSection() {
    const settings = usePlayableCopySettings();
    const save = useSavePlayableCopySettings();
    // The limit being dragged, shown until it is saved (or fails to save).
    const [draftLimit, setDraftLimit] = useState<number | null>(null);

    if (settings.isPending) {
        return <Skeleton className="h-48 w-full" />;
    }
    if (settings.isError) {
        return (
            <ErrorState
                title="Could not load the playable copy settings"
                message={errorMessage(settings.error)}
                onRetry={() => settings.refetch()}
            />
        );
    }

    const limitGb = draftLimit ?? settings.data.limitGb;

    return (
        <Card className="divide-y divide-border">
            <SettingRow
                title="Make playable copies"
                description="Some files are stored in a container the built-in player can't open, like an MPEG-TS saved as .mp4. Mnemo can copy the video into an MP4 without re-encoding, keeping the original as it is."
            >
                <ChoiceGroup
                    label="Make playable copies"
                    value={settings.data.mode}
                    options={MODES}
                    onChange={(mode) => save.mutate({ ...settings.data, mode })}
                />
            </SettingRow>
            <SettingRow
                title="Disk space for copies"
                description="When the copies pass this limit, the least recently played are deleted. Copies not played for 30 days are deleted too."
            >
                <Slider
                    label="Disk space for playable copies"
                    value={limitGb}
                    min={MIN_PLAYABLE_COPY_LIMIT_GB}
                    max={MAX_PLAYABLE_COPY_LIMIT_GB}
                    step={1}
                    valueText={`${limitGb} GB`}
                    onValueChange={setDraftLimit}
                    onValueCommit={(value) =>
                        save.mutate({ ...settings.data, limitGb: value }, { onSettled: () => setDraftLimit(null) })
                    }
                    className="w-48"
                />
                <span className="w-14 text-right text-body font-medium text-text tabular-nums">{limitGb} GB</span>
            </SettingRow>
            <UsageRow />
        </Card>
    );
}

function UsageRow() {
    const usage = usePlayableCopiesUsage();
    const clear = useClearPlayableCopies();
    const description = usage.isPending
        ? "Reading the disk usage…"
        : usage.isError
          ? `Could not read the disk usage: ${errorMessage(usage.error)}`
          : `${formatBytes(usage.data.usedBytes)} of ${formatBytes(usage.data.limitBytes)} used by ${usage.data.count} ${usage.data.count === 1 ? "copy" : "copies"}. They are made again when needed.`;
    return (
        <SettingRow title="Playable copies on disk" description={description}>
            <Button
                icon={<Trash2 />}
                loading={clear.isPending}
                disabled={usage.data?.count === 0}
                onClick={() => clear.mutate()}
            >
                Clear copies
            </Button>
        </SettingRow>
    );
}
