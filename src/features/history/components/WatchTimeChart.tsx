import { Tooltip } from "../../../shared/ui";
import { axisTicks, type ChartPeriod, formatWatchTime } from "../lib/history";

type WatchTimeChartProps = {
    /** Oldest first. */
    periods: readonly ChartPeriod[];
    /** Names the chart for screen readers, e.g. "Watched time per day". */
    label: string;
};

/**
 * Columns of watched time, one per period, over round gridlines. A single series, so no legend: the heading names
 * it. Each column reveals its exact value on hover or focus.
 */
export function WatchTimeChart({ periods, label }: WatchTimeChartProps) {
    const ticks = axisTicks(Math.max(0, ...periods.map((period) => period.seconds)));
    const top = ticks.at(-1) ?? 1;

    return (
        <div className="flex gap-3">
            {/* Y axis: tick labels aligned with the gridlines. */}
            <div aria-hidden className="relative h-56 w-14 shrink-0">
                {ticks.map((tick) => (
                    <span
                        key={tick}
                        className="absolute right-0 translate-y-1/2 text-caption text-text-subtle tabular-nums"
                        style={{ bottom: `${(tick / top) * 100}%` }}
                    >
                        {formatWatchTime(tick)}
                    </span>
                ))}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="relative h-56">
                    {ticks.map((tick) => (
                        <div
                            key={tick}
                            aria-hidden
                            className="absolute inset-x-0 border-t border-border"
                            style={{ bottom: `${(tick / top) * 100}%` }}
                        />
                    ))}
                    <ul aria-label={label} className="absolute inset-0 flex items-end gap-0.5">
                        {periods.map((period) => (
                            <li key={period.key} className="flex h-full min-w-0 flex-1 items-end justify-center">
                                <Tooltip content={period.description}>
                                    {/* The whole column is the target, so keyboard focus shows the value like hover. */}
                                    <button
                                        type="button"
                                        aria-label={period.description}
                                        className="group flex h-full w-full cursor-default items-end justify-center rounded-badge"
                                    >
                                        {period.seconds > 0 && (
                                            <span
                                                className="w-full max-w-6 rounded-t-badge bg-accent transition-colors duration-(--duration-fast) ease-standard group-hover:bg-accent-hover group-focus-visible:bg-accent-hover"
                                                style={{ height: `${(period.seconds / top) * 100}%` }}
                                            />
                                        )}
                                    </button>
                                </Tooltip>
                            </li>
                        ))}
                    </ul>
                </div>
                <ol aria-hidden className="flex gap-0.5">
                    {periods.map((period) => (
                        <li
                            key={period.key}
                            className="min-w-0 flex-1 truncate text-center text-caption text-text-subtle"
                        >
                            {period.label}
                        </li>
                    ))}
                </ol>
            </div>
        </div>
    );
}
