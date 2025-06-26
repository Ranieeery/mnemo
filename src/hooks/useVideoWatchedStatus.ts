import { ProcessedVideo } from '../services/videoProcessor';
import { markVideoAsWatched, markVideoAsUnwatched, getVideosInDirectoryOrderedByWatchStatus } from '../database';
import { VideoSearchActions, VideoSearchState } from './useVideoSearch';

export interface UseVideoWatchedStatusProps {
    setProcessedVideos: React.Dispatch<React.SetStateAction<ProcessedVideo[]>>;
    setRecentVideos: React.Dispatch<React.SetStateAction<ProcessedVideo[]>>;
    setVideosInProgress: React.Dispatch<React.SetStateAction<ProcessedVideo[]>>;
    setSuggestedVideos: React.Dispatch<React.SetStateAction<ProcessedVideo[]>>;
    loadHomePageData: () => Promise<void>;
    selectedFolder: string | null;
    searchState: VideoSearchState;
    searchActions: VideoSearchActions;
}

export const useVideoWatchedStatus = ({
    setProcessedVideos,
    setRecentVideos,
    setVideosInProgress,
    setSuggestedVideos,
    loadHomePageData,
    selectedFolder,
    searchState,
    searchActions
}: UseVideoWatchedStatusProps) => {
    
    const toggleVideoWatchedStatus = async (video: ProcessedVideo) => {
        try {
            if (!video.id) {
                return;
            }

            // Atualiza status no banco de dados
            if (video.is_watched) {
                await markVideoAsUnwatched(video.id);
            } else {
                await markVideoAsWatched(video.id, video.duration_seconds);
            }

            // Cria o vídeo atualizado
            const updatedVideo = { ...video, is_watched: !video.is_watched };

            // Função auxiliar para atualizar listas
            const updateVideoInList = (videos: ProcessedVideo[]) => 
                videos.map(v => v.file_path === video.file_path ? updatedVideo : v);

            // Atualiza todas as listas locais
            setProcessedVideos(prev => updateVideoInList(prev));
            setRecentVideos(prev => updateVideoInList(prev));
            setVideosInProgress(prev => updateVideoInList(prev));
            setSuggestedVideos(prev => updateVideoInList(prev));

            // Atualiza resultados de busca se existirem
            if (searchState.searchResults.length > 0) {
                searchActions.updateSearchResult(updatedVideo);
            }

            // Recarrega dados da página inicial para garantir consistência
            await loadHomePageData();
            
            // Se estiver em uma pasta, recarrega os vídeos da pasta atual
            if (selectedFolder) {
                const existingVideos = await getVideosInDirectoryOrderedByWatchStatus(selectedFolder);
                setProcessedVideos(existingVideos);
            }
        } catch (error) {
            console.error('Error toggling video watched status:', error);
        }
    };

    return {
        toggleVideoWatchedStatus
    };
};
