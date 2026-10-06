import type { DailyWatchTotal, HistoryEntry } from "../../../shared/ipc/bindings";

/** The chart covers this many days, or this many weeks (Monday to Sunday). */
export const CHART_DAYS = 14;
export const CHART_WEEKS = 12;

/** English names to match the interface; the clock follows the system's 12/24-hour preference. */
const LOCALE = "en-US";
const systemHourCycle = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle;

/** `YYYY-MM-DD` of a date in local time, the format the backend uses for days. */
export function dayKey(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}

/** A local day at noon, so adding days never trips over daylight saving changes. */
function parseDay(day: string): Date {
    const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
    return new Date(year, month - 1, date, 12);
}

function addDays(date: Date, days: number): Date {
    const shifted = new Date(date);
    shifted.setDate(shifted.getDate() + days);
    return shifted;
}

/** Monday of the week containing `date`. */
function weekStart(date: Date): Date {
    const daysSinceMonday = (date.getDay() + 6) % 7;
    return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12), -daysSinceMonday);
}

/** How many days of totals the chart needs: the last `CHART_WEEKS` weeks, up to today. */
export function totalsDaysNeeded(today: Date): number {
    const daysSinceMonday = (today.getDay() + 6) % 7;
    return (CHART_WEEKS - 1) * 7 + daysSinceMonday + 1;
}

/** Heading of a day in the history: "Today", "Yesterday", or the date (with the year when it is not this year). */
export function dayLabel(day: string, today: Date): string {
    if (day === dayKey(today)) {
        return "Today";
    }
    if (day === dayKey(addDays(today, -1))) {
        return "Yesterday";
    }
    const date = parseDay(day);
    return date.toLocaleDateString(LOCALE, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
    });
}

/** Local time of an ISO timestamp, e.g. "21:40" or "9:40 PM" depending on the system. */
export function timeOfDay(isoTimestamp: string): string {
    return new Date(isoTimestamp).toLocaleTimeString(LOCALE, {
        hour: "numeric",
        minute: "2-digit",
        hourCycle: systemHourCycle,
    });
}

/** Watched time in words: "45 min", "2 h", "2 h 10 min". Rounded to the minute. */
export function formatWatchTime(seconds: number): string {
    const minutes = Math.round(Math.max(0, seconds) / 60);
    if (minutes === 0) {
        return seconds > 0 ? "< 1 min" : "0 min";
    }
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) {
        return `${rest} min`;
    }
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export type DayGroup = { day: string; entries: HistoryEntry[] };

/** Consecutive entries of the same day, in the order they came (newest first). */
export function groupByDay(entries: readonly HistoryEntry[]): DayGroup[] {
    const groups: DayGroup[] = [];
    for (const entry of entries) {
        const last = groups.at(-1);
        if (last?.day === entry.day) {
            last.entries.push(entry);
        } else {
            groups.push({ day: entry.day, entries: [entry] });
        }
    }
    return groups;
}

/** One bar of the chart. */
export type ChartPeriod = {
    key: string;
    /** Short label under the bar. */
    label: string;
    /** Full description for the tooltip and screen readers. */
    description: string;
    videos: number;
    seconds: number;
};

function describe(name: string, videos: number, seconds: number): string {
    if (videos === 0) {
        return `${name}: nothing watched`;
    }
    return `${name}: ${formatWatchTime(seconds)}, ${videos} ${videos === 1 ? "video" : "videos"}`;
}

/** The last `CHART_DAYS` days up to today, oldest first, with empty days filled in. */
export function dailyPeriods(totals: readonly DailyWatchTotal[], today: Date): ChartPeriod[] {
    const byDay = new Map(totals.map((total) => [total.day, total]));
    return Array.from({ length: CHART_DAYS }, (_, index) => {
        const date = addDays(today, index - CHART_DAYS + 1);
        const key = dayKey(date);
        const total = byDay.get(key);
        const videos = total?.videos ?? 0;
        const seconds = total?.seconds ?? 0;
        return {
            key,
            label: date.toLocaleDateString(LOCALE, { weekday: "short", day: "numeric" }),
            description: describe(
                date.toLocaleDateString(LOCALE, { weekday: "long", month: "long", day: "numeric" }),
                videos,
                seconds
            ),
            videos,
            seconds,
        };
    });
}

/** The last `CHART_WEEKS` weeks (Monday to Sunday) up to the current one, oldest first. */
export function weeklyPeriods(totals: readonly DailyWatchTotal[], today: Date): ChartPeriod[] {
    const currentWeek = weekStart(today);
    const weeks = Array.from({ length: CHART_WEEKS }, (_, index) => ({
        start: addDays(currentWeek, (index - CHART_WEEKS + 1) * 7),
        videos: 0,
        seconds: 0,
    }));
    const byStart = new Map(weeks.map((week) => [dayKey(week.start), week]));
    for (const total of totals) {
        const week = byStart.get(dayKey(weekStart(parseDay(total.day))));
        if (week) {
            week.videos += total.videos;
            week.seconds += total.seconds;
        }
    }
    return weeks.map(({ start, videos, seconds }) => {
        const label = start.toLocaleDateString(LOCALE, { month: "short", day: "numeric" });
        return {
            key: dayKey(start),
            label,
            description: describe(
                `Week of ${start.toLocaleDateString(LOCALE, { month: "long", day: "numeric" })}`,
                videos,
                seconds
            ),
            videos,
            seconds,
        };
    });
}

const TICK_STEPS_MINUTES = [5, 10, 15, 30, 60, 120, 180, 240, 300, 600, 1200];

/** Gridline values in seconds, from 0 to the first round value at or above `maxSeconds`, at most 5 lines. */
export function axisTicks(maxSeconds: number): number[] {
    const maxMinutes = Math.max(maxSeconds / 60, 1);
    const step = TICK_STEPS_MINUTES.find((minutes) => maxMinutes / minutes <= 4) ?? Math.ceil(maxMinutes / 4);
    const count = Math.ceil(maxMinutes / step);
    return Array.from({ length: count + 1 }, (_, index) => index * step * 60);
}
