import { invoke } from "@tauri-apps/api/core";

export interface Subtitle {
    start: number;
    end: number;
    text: string;
}

export const checkAndLoadSubtitles = async (videoPath: string): Promise<{ content: string; format: string } | null> => {
    try {
        const videoWithoutExt = videoPath.replace(/\.[^/.]+$/, "");
        const subtitleExtensions = [".srt", ".vtt", ".sub", ".ass"];

        for (const ext of subtitleExtensions) {
            const subtitlePath = videoWithoutExt + ext;

            try {
                const exists = (await invoke("file_exists", { path: subtitlePath })) as boolean;

                if (exists) {
                    const content = (await invoke("read_subtitle_file", { path: subtitlePath })) as string;
                    const format = ext.substring(1);

                    return { content, format };
                }
            } catch (fileError) {
                continue;
            }
        }

        return null;
    } catch (error) {
        console.error("Error in checkAndLoadSubtitles:", error);
        return null;
    }
};

export const parseSubtitles = (subtitleData: { content: string; format: string }): Subtitle[] => {
    const subtitles: Subtitle[] = [];
    const { content, format } = subtitleData;

    if (format === "srt") {
        const blocks = content.trim().split(/\n\s*\n/);

        blocks.forEach((block) => {
            const lines = block.trim().split("\n");
            if (lines.length >= 3) {
                let timeMatch;
                let timeLineIndex = -1;

                for (let i = 0; i < Math.min(lines.length, 3); i++) {
                    timeMatch = lines[i].match(
                        /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/
                    );
                    if (timeMatch) {
                        timeLineIndex = i;
                        break;
                    }
                }

                if (timeMatch && timeLineIndex !== -1) {
                    const startTime =
                        parseInt(timeMatch[1]) * 3600 +
                        parseInt(timeMatch[2]) * 60 +
                        parseInt(timeMatch[3]) +
                        parseInt(timeMatch[4]) / 1000;
                    const endTime =
                        parseInt(timeMatch[5]) * 3600 +
                        parseInt(timeMatch[6]) * 60 +
                        parseInt(timeMatch[7]) +
                        parseInt(timeMatch[8]) / 1000;
                    const text = lines
                        .slice(timeLineIndex + 1)
                        .join("\n")
                        .trim();

                    if (text) {
                        subtitles.push({
                            start: startTime,
                            end: endTime,
                            text: text,
                        });
                    }
                }
            }
        });
    } else if (format === "vtt") {
        const lines = content.split("\n");
        let i = 0;

        while (i < lines.length && !lines[i].includes("-->")) {
            i++;
        }

        while (i < lines.length) {
            const line = lines[i].trim();

            const timeMatch = line.match(
                /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})/
            );
            if (timeMatch) {
                const startTime =
                    parseInt(timeMatch[1]) * 3600 +
                    parseInt(timeMatch[2]) * 60 +
                    parseInt(timeMatch[3]) +
                    parseInt(timeMatch[4]) / 1000;
                const endTime =
                    parseInt(timeMatch[5]) * 3600 +
                    parseInt(timeMatch[6]) * 60 +
                    parseInt(timeMatch[7]) +
                    parseInt(timeMatch[8]) / 1000;

                i++;
                const textLines = [];
                while (i < lines.length && lines[i].trim() !== "") {
                    const textLine = lines[i].trim();
                    if (textLine) {
                        textLines.push(textLine);
                    }
                    i++;
                }

                const text = textLines.join("\n").trim();
                if (text) {
                    subtitles.push({
                        start: startTime,
                        end: endTime,
                        text: text,
                    });
                }
            }
            i++;
        }
    } else if (format === "sub") {
        const lines = content.split("\n");

        lines.forEach((line) => {
            const trimmedLine = line.trim();
            if (trimmedLine) {
                const match = trimmedLine.match(/\{(\d+)\}\{(\d+)\}(.+)/);
                if (match) {
                    const startFrame = parseInt(match[1]);
                    const endFrame = parseInt(match[2]);
                    const text = match[3];

                    const startTime = startFrame / 25;
                    const endTime = endFrame / 25;

                    if (text) {
                        subtitles.push({
                            start: startTime,
                            end: endTime,
                            text: text,
                        });
                    }
                }
            }
        });
    } else if (format === "ass") {
        const lines = content.split("\n");
        let inEventsSection = false;

        lines.forEach((line) => {
            const trimmedLine = line.trim();

            if (trimmedLine === "[Events]") {
                inEventsSection = true;
                return;
            }

            if (trimmedLine.startsWith("[") && trimmedLine !== "[Events]") {
                inEventsSection = false;
                return;
            }

            if (inEventsSection && trimmedLine.startsWith("Dialogue:")) {
                const parts = trimmedLine.split(",");
                if (parts.length >= 10) {
                    const startTime = parseAssTime(parts[1]);
                    const endTime = parseAssTime(parts[2]);
                    const text = parts
                        .slice(9)
                        .join(",")
                        .replace(/\{[^}]*\}/g, "");

                    if (text && startTime !== null && endTime !== null) {
                        subtitles.push({
                            start: startTime,
                            end: endTime,
                            text: text,
                        });
                    }
                }
            }
        });
    }

    return subtitles;
};

function parseAssTime(timeStr: string): number | null {
    const match = timeStr.match(/(\d):(\d{2}):(\d{2})\.(\d{2})/);
    if (!match) return null;

    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const seconds = parseInt(match[3]);
    const centiseconds = parseInt(match[4]);

    return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
}

export const getCurrentSubtitle = (currentTime: number, subtitles: Subtitle[], subtitlesEnabled: boolean): string => {
    if (!subtitlesEnabled || !subtitles.length) return "";

    const currentSub = subtitles.find((sub) => {
        return currentTime >= sub.start && currentTime <= sub.end;
    });

    return currentSub ? currentSub.text : "";
};
