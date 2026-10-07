import { useEffect, useState } from "react";
import {
    DEFAULT_WATCHED_THRESHOLD,
    MAX_WATCHED_THRESHOLD,
    MIN_WATCHED_THRESHOLD,
    WATCHED_THRESHOLD_STEP,
} from "../../../shared/ipc/bindings";
import { errorMessage } from "../../../shared/ipc/client";
import { Card, ErrorState, Skeleton, Slider } from "../../../shared/ui";
import { useAppSettings, useUpdateSettings } from "../queries";
import { SettingRow } from "./SettingRow";
import { SubtitleStyleSection } from "./SubtitleStyleSection";

const toPercent = (fraction: number) => Math.round(fraction * 100);

export function PlaybackTab() {
    const settings = useAppSettings();
    const updateSettings = useUpdateSettings();
    const [percent, setPercent] = useState(toPercent(DEFAULT_WATCHED_THRESHOLD));

    useEffect(() => {
        if (settings.data) {
            setPercent(toPercent(settings.data.watchedThreshold));
        }
    }, [settings.data]);

    if (settings.isPending) {
        return <Skeleton className="h-20 w-full" />;
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

    return (
        <div className="flex flex-col gap-8">
            <section aria-labelledby="watched-heading" className="flex flex-col gap-3">
                <h2 id="watched-heading" className="text-title font-semibold text-text">
                    Watched status
                </h2>
                <Card>
                    <SettingRow
                        title="Count a video as watched at"
                        description={
                            <>
                                A video is marked as watched once you reach {percent}% of it, or when it plays to the
                                end. Videos already marked keep their status. The default is{" "}
                                {toPercent(DEFAULT_WATCHED_THRESHOLD)}%.
                            </>
                        }
                    >
                        <Slider
                            label="Watched threshold"
                            value={percent}
                            min={toPercent(MIN_WATCHED_THRESHOLD)}
                            max={toPercent(MAX_WATCHED_THRESHOLD)}
                            step={toPercent(WATCHED_THRESHOLD_STEP)}
                            valueText={`${percent}%`}
                            onValueChange={setPercent}
                            onValueCommit={(value) =>
                                updateSettings.mutate({ ...settings.data, watchedThreshold: value / 100 })
                            }
                            className="w-48"
                        />
                        <span className="w-12 text-right text-body font-medium text-text tabular-nums">{percent}%</span>
                    </SettingRow>
                </Card>
            </section>
            <section aria-labelledby="subtitles-heading" className="flex flex-col gap-3">
                <h2 id="subtitles-heading" className="text-title font-semibold text-text">
                    Subtitles
                </h2>
                <SubtitleStyleSection />
            </section>
        </div>
    );
}
