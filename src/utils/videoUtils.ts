export const VIDEO_EXTENSIONS = [
    ".mp4",
    ".avi",
    ".mkv",
    ".mov",
    ".wmv",
    ".flv",
    ".webm",
    ".m4v",
    ".mpg",
    ".mpeg",
    ".3gp",
    ".ogv",
    ".ts",
    ".mts",
    ".m2ts",
];

export function isVideoFile(filename: string): boolean {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));
    return VIDEO_EXTENSIONS.includes(ext);
}

export function getVideoTitle(filepath: string): string {
    const filename = filepath.split(/[/\\]/).pop() || "";
    const lastDotIndex = filename.lastIndexOf(".");
    return lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;
}
