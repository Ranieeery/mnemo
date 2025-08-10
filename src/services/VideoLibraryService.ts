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
    // Load aggregate data required for the home dashboard
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
            console.error('Erro ao carregar dados da página inicial:', error);
            throw new Error('Falha ao carregar dados da página inicial');
        }
    }

    // Return all library folder paths
    static async getLibraryFolders(): Promise<string[]> {
        try {
            return await getLibraryFolders();
        } catch (error) {
            console.error('Erro ao carregar pastas da biblioteca:', error);
            throw new Error('Falha ao carregar pastas da biblioteca');
        }
    }

    // Add a folder path to the library
    static async addLibraryFolder(folderPath: string): Promise<void> {
        try {
            await saveLibraryFolder(folderPath);
        } catch (error) {
            console.error('Erro ao adicionar pasta da biblioteca:', error);
            throw new Error('Falha ao adicionar pasta da biblioteca');
        }
    }

    // Remove a folder from the library
    static async removeLibraryFolder(folderPath: string): Promise<void> {
        try {
            await dbRemoveLibraryFolder(folderPath);
        } catch (error) {
            console.error('Erro ao remover pasta da biblioteca:', error);
            throw new Error('Falha ao remover pasta da biblioteca');
        }
    }

    // Get videos in a directory ordered by watch status
    static async getVideosInDirectory(directoryPath: string): Promise<ProcessedVideo[]> {
        try {
            return await getVideosInDirectoryOrderedByWatchStatus(directoryPath);
        } catch (error) {
            console.error('Erro ao carregar vídeos do diretório:', error);
            throw new Error('Falha ao carregar vídeos do diretório');
        }
    }

    // Update persisted watch progress
    static async updateVideoProgress(videoId: number, currentTime: number, duration: number): Promise<void> {
        try {
            await updateWatchProgress(videoId, currentTime, duration);
        } catch (error) {
            console.error('Erro ao atualizar progresso do vídeo:', error);
            throw new Error('Falha ao atualizar progresso do vídeo');
        }
    }

    // Run a search query (title, description, tags)
    static async searchVideos(query: string): Promise<VideoSearchResult> {
        try {
            const videos = await searchVideos(query);
            return {
                videos,
                totalCount: videos.length
            };
        } catch (error) {
            console.error('Erro ao buscar vídeos:', error);
            throw new Error('Falha ao buscar vídeos');
        }
    }

    // Simple video path extension validation
    static isValidVideoPath(filePath: string): boolean {
        const videoExtensions = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v'];
        const extension = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
        return videoExtensions.includes(extension);
    }

    // Human readable duration formatting
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

    // Compute watch percentage (0..100)
    static calculateWatchPercentage(currentTime: number, duration: number): number {
        if (duration === 0) return 0;
        return Math.min(100, Math.max(0, (currentTime / duration) * 100));
    }

    // Determine if a video counts as watched
    static isVideoWatched(currentTime: number, duration: number): boolean {
        const percentage = this.calculateWatchPercentage(currentTime, duration);
        return percentage >= 90; // Considera assistido se 90% ou mais foi visualizado
    }

    // Derive a user facing status label
    static getVideoStatusText(video: ProcessedVideo): string {
        if (!video.duration_seconds) return 'Duração desconhecida';
        
        const percentage = this.calculateWatchPercentage(video.watch_progress_seconds || 0, video.duration_seconds);
        
        if (percentage >= 90) return 'Assistido';
        if (percentage > 5) return `${Math.round(percentage)}% assistido`;
        return 'Não assistido';
    }
}
