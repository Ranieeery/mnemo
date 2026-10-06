import { ChartColumn } from "lucide-react";
import { useState } from "react";
import { errorMessage } from "../../../shared/ipc/client";
import { Button, EmptyState, ErrorState, Skeleton } from "../../../shared/ui";
import {
    CHART_DAYS,
    CHART_WEEKS,
    dailyPeriods,
    formatWatchTime,
    totalsDaysNeeded,
    weeklyPeriods,
} from "../lib/history";
import { useWatchTotals } from "../queries";
import { WatchTimeChart } from "./WatchTimeChart";

type Grouping = "days" | "weeks";

/** Watched time per day or week. One request covers both views. */
export function WatchStatistics() {
    const [today] = useState(() => new Date());
    const [grouping, setGrouping] = useState<Grouping>("days");
    const totals = useWatchTotals(totalsDaysNeeded(today));

    if (totals.isPending) {
        return (
            <div aria-busy className="flex flex-col gap-4">
                <span className="sr-only">Loading statistics</span>
                <Skeleton className="h-6 w-56" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }
    if (totals.isError) {
        return (
            <ErrorState
                title="Could not load the statistics"
                message={errorMessage(totals.error)}
                onRetry={() => totals.refetch()}
            />
        );
    }
    if (totals.data.length === 0) {
        return (
            <EmptyState
                icon={ChartColumn}
                title={`Nothing finished in the last ${CHART_WEEKS} weeks`}
                description="Each video you finish adds its length to the day you finished it."
            />
        );
    }

    const periods = grouping === "days" ? dailyPeriods(totals.data, today) : weeklyPeriods(totals.data, today);
    const seconds = periods.reduce((sum, period) => sum + period.seconds, 0);
    const videos = periods.reduce((sum, period) => sum + period.videos, 0);
    const span = grouping === "days" ? `last ${CHART_DAYS} days` : `last ${CHART_WEEKS} weeks`;

    return (
        <section aria-labelledby="watch-time-heading" className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h2 id="watch-time-heading" className="text-title font-semibold text-text">
                        Watched time
                    </h2>
                    <p className="text-small text-text-muted">The length of the videos you finished each day.</p>
                </div>
                <fieldset className="flex gap-1">
                    <legend className="sr-only">Group by</legend>
                    {(["days", "weeks"] as const).map((option) => (
                        <Button
                            key={option}
                            size="sm"
                            variant={grouping === option ? "secondary" : "ghost"}
                            aria-pressed={grouping === option}
                            onClick={() => setGrouping(option)}
                        >
                            {option === "days" ? "Days" : "Weeks"}
                        </Button>
                    ))}
                </fieldset>
            </div>
            <p className="text-body text-text-muted">
                <span className="text-heading font-semibold text-text tabular-nums">{formatWatchTime(seconds)}</span> in
                the {span}, {videos} {videos === 1 ? "video" : "videos"}
            </p>
            <WatchTimeChart
                periods={periods}
                label={grouping === "days" ? "Watched time per day" : "Watched time per week"}
            />
        </section>
    );
}
