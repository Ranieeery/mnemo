const UNITS = ["bytes", "KB", "MB", "GB", "TB"] as const;

/** Formats a size in bytes with binary multiples and one decimal above kilobytes: `1.5 MB`. */
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 1024) {
        return `${Math.max(0, Math.round(bytes || 0))} bytes`;
    }
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
    return `${(bytes / 1024 ** exponent).toFixed(1)} ${UNITS[exponent]}`;
}
