import { ProcessedVideo } from "../types/video";
import { markVideoAsWatched, markVideoAsUnwatched, getVideosInDirectoryOrderedByWatchStatus } from "../database";
import { VideoSearchActions, VideoSearchState } from "./useVideoSearch";

export interface UseVideoWatchedStatusProps {
    setProcessedVideos: React.Dispatch<React.SetStateAction<ProcessedVideo[]>>;
    setRecentVideos: React.Dispatch<React.SetStateAction<ProcessedVideo[]>>;
    setVideosInProgress: React.Dispatch<React.SetStateAction<ProcessedVideo[]>>;
    setSuggestedVideos: React.Dispatch<React.SetStateAction<ProcessedVideo[]>>;
    loadHomePageData: () => Promise<void>;
    selectedFolder: string | null;
    searchState: VideoSearchState;
    searchActions: VideoSearchActions;
    currentlyPlayingVideo: ProcessedVideo | null;
    setPlayingVideo: React.Dispatch<React.SetStateAction<ProcessedVideo | null>>;
}

export const useVideoWatchedStatus = ({
    setProcessedVideos,
    setRecentVideos,
    setVideosInProgress,
    setSuggestedVideos,
    loadHomePageData,
    selectedFolder,
    searchState,
    searchActions,
    currentlyPlayingVideo,
    setPlayingVideo,
}: UseVideoWatchedStatusProps) => {
    const toggleVideoWatchedStatus = async (video: ProcessedVideo) => {
        try {
            if (!video.id) return;
            if (video.is_watched) {
                await markVideoAsUnwatched(video.id);
            } else {
                await markVideoAsWatched(video.id, video.duration_seconds);
            }
            const updatedVideo: ProcessedVideo = { ...video, is_watched: !video.is_watched };
            const updateVideoInList = (videos: ProcessedVideo[]): ProcessedVideo[] =>
                videos.map((v) => (v.file_path === video.file_path ? updatedVideo : v));
            setProcessedVideos((prev: ProcessedVideo[]) => updateVideoInList(prev));
            setRecentVideos((prev: ProcessedVideo[]) => updateVideoInList(prev));
            setVideosInProgress((prev: ProcessedVideo[]) => updateVideoInList(prev));
            setSuggestedVideos((prev: ProcessedVideo[]) => updateVideoInList(prev));
            if (searchState.searchResults.length > 0) {
                searchActions.updateSearchResult(updatedVideo);
            }
            if (currentlyPlayingVideo && currentlyPlayingVideo.file_path === video.file_path) {
                setPlayingVideo((prev: ProcessedVideo | null) =>
                    prev && prev.file_path === video.file_path ? updatedVideo : prev
                );
            }
            setTimeout(async () => {
                try {
                    await loadHomePageData();
                    if (selectedFolder) {
                        const existingVideos = await getVideosInDirectoryOrderedByWatchStatus(selectedFolder);
                        setProcessedVideos(existingVideos);
                    }
                } catch (e) {
                    console.error("Error refreshing data after toggle watched:", e);
                }
            }, 0);
        } catch (error) {
            console.error("Error toggling video watched status:", error);
        }
    };

    return { toggleVideoWatchedStatus };
};
