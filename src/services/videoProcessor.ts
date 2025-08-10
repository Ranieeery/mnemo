import {invoke} from "@tauri-apps/api/core";
import {appDataDir, join} from "@tauri-apps/api/path";
import {getVideoByPath, saveVideo} from "../database";
import {getVideoTitle, isVideoFile} from "../utils/videoUtils";
import type { ProcessedVideo } from "../types/video";

// Video metadata returned from Rust (ffprobe wrapper)
interface VideoMetadata {
    duration: number;
    width: number;
    height: number;
    bitrate?: number;
    codec?: string;
    file_size: number;
}

// Process a single video: metadata extraction + thumbnail + DB persistence
export async function processVideo(videoPath: string): Promise<ProcessedVideo | null> {
    try {
        console.log(`Processing video: ${videoPath}`);

    // Skip if already processed
        const existingVideo = await getVideoByPath(videoPath);
        if (existingVideo) {
            console.log(`Video already processed: ${videoPath}`);
            return existingVideo;
        }

    // Extract metadata via backend command
        const metadata: VideoMetadata = await invoke('extract_video_metadata', {
            filePath: videoPath
        });

    // Build unique thumbnail file path
        const appDir = await appDataDir();
        const thumbnailsDir = await join(appDir, 'thumbnails');
        const videoName = videoPath.split(/[/\\]/).pop() || 'unknown';
        const thumbnailName = `${videoName}_${Date.now()}.jpg`;
        const thumbnailPath = await join(thumbnailsDir, thumbnailName);

    // Generate thumbnail (ffmpeg)
        await invoke('generate_thumbnail', {
            videoPath,
            outputPath: thumbnailPath,
            timestamp: Math.min(10.0, metadata.duration / 4) // 10s or 1/4 of duration
        });

    // Compose processed video object
        const processedVideo: ProcessedVideo = {
            file_path: videoPath,
            title: getVideoTitle(videoPath),
            duration_seconds: Math.round(metadata.duration),
            thumbnail_path: thumbnailPath,
        };

    // Persist in DB
        await saveVideo(processedVideo);

        console.log(`Video processed successfully: ${videoPath}`);
        return processedVideo;

    } catch (error) {
        console.error(`Error processing video ${videoPath}:`, error);
        return null;
    }
}

// Process all videos in a directory
export async function processVideosInDirectory(directoryPath: string): Promise<ProcessedVideo[]> {
    try {
        console.log(`Scanning directory for videos: ${directoryPath}`);

    // Read directory entries
        const contents: any[] = await invoke('read_directory', {path: directoryPath});

    // Filter only video files
        const videoFiles = contents.filter(item => !item.is_dir && isVideoFile(item.name));

        console.log(`Found ${videoFiles.length} video files in ${directoryPath}`);

        const processedVideos: ProcessedVideo[] = [];

    // Sequential processing to avoid resource spikes
        for (const videoFile of videoFiles) {
            try {
                const processedVideo = await processVideo(videoFile.path);
                if (processedVideo) {
                    processedVideos.push(processedVideo);
                }
            } catch (error) {
                console.error(`Failed to process video ${videoFile.path}:`, error);
            }
        }

        console.log(`Successfully processed ${processedVideos.length} videos`);
        return processedVideos;

    } catch (error) {
        console.error(`Error scanning directory ${directoryPath}:`, error);
        return [];
    }
}

// Heuristic check for ffmpeg / ffprobe availability
export async function checkVideoToolsAvailable(): Promise<{ ffmpeg: boolean; ffprobe: boolean }> {
    try {
        const ffprobeResult = await invoke('extract_video_metadata', {
            filePath: 'nonexistent_file_test.mp4'
        }).catch((error) => {
            // If error mentions missing file only, ffprobe binary is present
            return error.includes('File does not exist') ? 'available' : 'not_available';
        });

        const ffmpegResult = await invoke('generate_thumbnail', {
            videoPath: 'nonexistent_file_test.mp4',
            outputPath: 'test.jpg'
        }).catch((error) => {
            // If error is not execution failure, ffmpeg binary is present
            return error.includes('Failed to execute') ? 'not_available' : 'available';
        });

        return {
            ffmpeg: ffmpegResult === 'available',
            ffprobe: ffprobeResult === 'available'
        };
    } catch (error) {
        console.error('Error checking video tools:', error);
        return {ffmpeg: false, ffprobe: false};
    }
}
