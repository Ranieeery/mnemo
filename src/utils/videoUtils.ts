// Video utility helpers

// Supported video extensions
export const VIDEO_EXTENSIONS = [
    '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v',
    '.mpg', '.mpeg', '.3gp', '.ogv', '.ts', '.mts', '.m2ts'
];

// Check if filename has a supported video extension
export function isVideoFile(filename: string): boolean {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return VIDEO_EXTENSIONS.includes(ext);
}

// Convert seconds to HH:MM:SS (or M:SS)
export function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Extract filename (without extension) usable as initial title
export function getVideoTitle(filepath: string): string {
    const filename = filepath.split(/[/\\]/).pop() || '';
    const lastDotIndex = filename.lastIndexOf('.');
    return lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;
}
