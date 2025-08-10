import { ProcessedVideo } from '../types/video';
import { 
    getLibraryFolders, 
    getRecentlyWatchedVideos, 
    getVideosInProgress, 
    getUnwatchedVideos,
    getLibraryFoldersWithPreviews,
    saveLibraryFolder,
    removeLibraryFolder as dbRemoveLibraryFolder,
    getVideosInDirectoryOrderedByWatchStatus,
    updateWatchProgress,
    searchVideos
} from '../database';

export interface HomePageData {
    recentVideos: ProcessedVideo[];
    videosInProgress: ProcessedVideo[];
    suggestedVideos: ProcessedVideo[];
    libraryFoldersWithPreviews: { folder: string; videos: ProcessedVideo[] }[];
}

export interface VideoSearchResult {
    videos: ProcessedVideo[];
    totalCount: number;
}

export class VideoLibraryService {
    static async loadHomePageData(): Promise<HomePageData> {
        try {
            const [recent, inProgress, suggestions, foldersWithPreviews] = await Promise.all([
                getRecentlyWatchedVideos(8),
                getVideosInProgress(8),
                getUnwatchedVideos(16),
                getLibraryFoldersWithPreviews()
            ]);

            return {
                recentVideos: recent,
                videosInProgress: inProgress,
                suggestedVideos: suggestions,
                libraryFoldersWithPreviews: foldersWithPreviews
            };
        } catch (error) {
            console.error('Error loading home page data:', error);
            throw new Error('Failed to load home page data');
        }
    }

    static async getLibraryFolders(): Promise<string[]> {
        try {
            return await getLibraryFolders();
        } catch (error) {
            console.error('Erro ao carregar pastas da biblioteca:', error);
            throw new Error('Falha ao carregar pastas da biblioteca');
        }
    }

    static async addLibraryFolder(folderPath: string): Promise<void> {
        try {
            await saveLibraryFolder(folderPath);
        } catch (error) {
            console.error('Erro ao adicionar pasta da biblioteca:', error);
            throw new Error('Falha ao adicionar pasta da biblioteca');
        }
    }

    static async removeLibraryFolder(folderPath: string): Promise<void> {
        try {
            await dbRemoveLibraryFolder(folderPath);
        } catch (error) {
            console.error('Erro ao remover pasta da biblioteca:', error);
            throw new Error('Falha ao remover pasta da biblioteca');
        }
    }

    static async getVideosInDirectory(directoryPath: string): Promise<ProcessedVideo[]> {
        try {
            return await getVideosInDirectoryOrderedByWatchStatus(directoryPath);
        } catch (error) {
            console.error('Error loading directory videos:', error);
            throw new Error('Failed to load directory videos');
        }
    }

    static async updateVideoProgress(videoId: number, currentTime: number, duration: number): Promise<void> {
        try {
            await updateWatchProgress(videoId, currentTime, duration);
        } catch (error) {
            console.error('Error updating video progress:', error);
            throw new Error('Failed to update video progress');
        }
    }

    static async searchVideos(query: string): Promise<VideoSearchResult> {
        try {
            const videos = await searchVideos(query);
            return {
                videos,
                totalCount: videos.length
            };
        } catch (error) {
            console.error('Error searching videos:', error);
            throw new Error('Failed to search videos');
        }
    }

    static isValidVideoPath(filePath: string): boolean {
        const videoExtensions = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v'];
        const extension = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
        return videoExtensions.includes(extension);
    }

    static formatDuration(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
    }

    static calculateWatchPercentage(currentTime: number, duration: number): number {
        if (duration === 0) return 0;
        return Math.min(100, Math.max(0, (currentTime / duration) * 100));
    }

    static isVideoWatched(currentTime: number, duration: number): boolean {
        const percentage = this.calculateWatchPercentage(currentTime, duration);
        return percentage >= 90;
    }

    static getVideoStatusText(video: ProcessedVideo): string {
        if (!video.duration_seconds) return 'Unknown duration';
        
        const percentage = this.calculateWatchPercentage(video.watch_progress_seconds || 0, video.duration_seconds);
        
        if (percentage >= 90) return 'Assistido';
        if (percentage > 5) return `${Math.round(percentage)}% assistido`;
        return 'Not watched';
    }
}
