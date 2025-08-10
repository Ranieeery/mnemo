import { useState } from 'react';
import { ProcessedVideo } from '../types/video';
import { updateVideoDetails } from '../database';
import { checkAndLoadSubtitles, parseSubtitles } from '../utils/subtitleUtils';

interface UseModalsProps {
    setProcessedVideos: React.Dispatch<React.SetStateAction<ProcessedVideo[]>>;
    libraryActions: {
        confirmRemoveFolder: (folderPath: string, selectedFolder: string | null, goToHomePage: () => void) => Promise<void>;
    };
    navigation: {
        goToHomePage: () => void;
    };
    videoPlayer: {
        setPlayingVideo: (video: ProcessedVideo) => void;
        setSubtitles: (subtitles: any[]) => void;
        setSubtitlesAvailable: (available: boolean) => void;
        setSubtitlesEnabled: (enabled: boolean) => void;
        handleSpeedChange: (speed: number) => void;
        handleVolumeChange: (volume: number) => void;
    };
    selectedFolder: string | null;
    handleLibraryChanged: () => Promise<void>;
}

export const useModals = ({
    setProcessedVideos,
    libraryActions,
    navigation,
    videoPlayer,
    selectedFolder,
    handleLibraryChanged
}: UseModalsProps) => {
    const [selectedVideo, setSelectedVideo] = useState<ProcessedVideo | null>(null);
    const [showVideoDetails, setShowVideoDetails] = useState<boolean>(false);
    const [editingTitle, setEditingTitle] = useState<string>("");
    const [editingDescription, setEditingDescription] = useState<string>("");

    const [showRemoveConfirmation, setShowRemoveConfirmation] = useState<boolean>(false);
    const [folderToRemove, setFolderToRemove] = useState<string | null>(null);

    const [showSettings, setShowSettings] = useState<boolean>(false);

    const [showNextVideoPrompt, setShowNextVideoPrompt] = useState<boolean>(false);
    const [nextVideo, setNextVideo] = useState<ProcessedVideo | null>(null);
    const [savedPlaybackSettings, setSavedPlaybackSettings] = useState<{
        speed: number;
        volume: number;
        subtitlesEnabled: boolean;
    }>({speed: 1, volume: 1, subtitlesEnabled: false});
    const [nextVideoTimeout, setNextVideoTimeout] = useState<number | null>(null);
    const [nextVideoCountdown, setNextVideoCountdown] = useState<number>(10);

    const handleOpenVideoDetails = (video: ProcessedVideo) => {
        setSelectedVideo(video);
        setEditingTitle(video.title);
        setEditingDescription(video.description || "");
        setShowVideoDetails(true);
    };

    const handleCloseVideoDetails = () => {
        setShowVideoDetails(false);
        setSelectedVideo(null);
    };

    const handleSaveVideoDetails = async () => {
        if (!selectedVideo) return;

        try {
            await updateVideoDetails(selectedVideo.file_path, editingTitle, editingDescription);

            setProcessedVideos(prev => prev.map(video =>
                video.file_path === selectedVideo.file_path
                    ? {...video, title: editingTitle, description: editingDescription}
                    : video
            ));

            setSelectedVideo(prev => prev ? {...prev, title: editingTitle, description: editingDescription} : null);

            console.log("Video details saved successfully");
        } catch (error) {
            console.error("Error saving video details:", error);
            alert("Error saving video details. Please try again.");
        }
    };

    const handleCancelEdit = () => {
        if (selectedVideo) {
            setEditingTitle(selectedVideo.title);
            setEditingDescription(selectedVideo.description || "");
        }
    };

    const handleRemoveFolderRequest = (folderPath: string) => {
        setFolderToRemove(folderPath);
        setShowRemoveConfirmation(true);
    };

    const confirmRemoveFolder = async () => {
        if (!folderToRemove) return;

        await libraryActions.confirmRemoveFolder(folderToRemove, selectedFolder, navigation.goToHomePage);
        setShowRemoveConfirmation(false);
        setFolderToRemove(null);
    };

    const cancelRemoveFolder = () => {
        setShowRemoveConfirmation(false);
        setFolderToRemove(null);
    };

    const handleOpenSettings = () => {
        setShowSettings(true);
    };

    const handleCloseSettings = () => {
        setShowSettings(false);
    };

    const playNextVideo = async () => {
        if (nextVideo) {
            if (nextVideoTimeout) {
                clearInterval(nextVideoTimeout);
                setNextVideoTimeout(null);
            }

            setShowNextVideoPrompt(false);

            videoPlayer.setPlayingVideo(nextVideo);

            const subtitleData = await checkAndLoadSubtitles(nextVideo.file_path);
            if (subtitleData) {
                const parsedSubtitles = parseSubtitles(subtitleData);
                videoPlayer.setSubtitles(parsedSubtitles);
                videoPlayer.setSubtitlesAvailable(true);
            } else {
                videoPlayer.setSubtitles([]);
                videoPlayer.setSubtitlesAvailable(false);
            }

            setTimeout(() => {
                const video = document.querySelector('video') as HTMLVideoElement;
                if (video) {
                    video.playbackRate = savedPlaybackSettings.speed;
                    video.volume = savedPlaybackSettings.volume;
                    videoPlayer.handleSpeedChange(savedPlaybackSettings.speed);
                    videoPlayer.handleVolumeChange(savedPlaybackSettings.volume);
                    videoPlayer.setSubtitlesEnabled(savedPlaybackSettings.subtitlesEnabled);
                }
            }, 100);

            setNextVideo(null);
            setNextVideoCountdown(10);
        }
    };

    const cancelNextVideo = () => {
        if (nextVideoTimeout) {
            clearInterval(nextVideoTimeout);
            setNextVideoTimeout(null);
        }
        setShowNextVideoPrompt(false);
        setNextVideo(null);
        setNextVideoCountdown(10);
    };

    const startNextVideoCountdown = (video: ProcessedVideo, currentPlaybackSettings: {speed: number, volume: number, subtitlesEnabled: boolean}) => {
        setSavedPlaybackSettings(currentPlaybackSettings);
        setNextVideo(video);
        setShowNextVideoPrompt(true);
        setNextVideoCountdown(10);

        const countdownInterval = setInterval(() => {
            setNextVideoCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(countdownInterval);
                    playNextVideo();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        setNextVideoTimeout(countdownInterval);
    };

    return {
        selectedVideo,
        showVideoDetails,
        editingTitle,
        setEditingTitle,
        editingDescription,
        setEditingDescription,
        showRemoveConfirmation,
        folderToRemove,
        showSettings,
        showNextVideoPrompt,
        nextVideo,
        savedPlaybackSettings,
        nextVideoCountdown,

        handleOpenVideoDetails,
        handleCloseVideoDetails,
        handleSaveVideoDetails,
        handleCancelEdit,
        handleRemoveFolderRequest,
        confirmRemoveFolder,
        cancelRemoveFolder,
        handleOpenSettings,
        handleCloseSettings: () => {
            handleCloseSettings();
            handleLibraryChanged();
        },
        playNextVideo,
        cancelNextVideo,
        startNextVideoCountdown
    };
};
