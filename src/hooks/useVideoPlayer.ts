import { useState, useEffect } from 'react';
import { ProcessedVideo } from '../types/video';
import { checkAndLoadSubtitles, parseSubtitles, getCurrentSubtitle, Subtitle } from '../utils/subtitleUtils';

interface UseVideoPlayerProps {
    setShowVideoPlayer: (show: boolean) => void;
    updateWatchProgress: (videoId: number, currentTime: number, duration: number) => Promise<void>;
    setProcessedVideos: React.Dispatch<React.SetStateAction<ProcessedVideo[]>>;
    loadHomePageData: () => Promise<void>;
}

export const useVideoPlayer = ({
    setShowVideoPlayer,
    updateWatchProgress,
    setProcessedVideos,
    loadHomePageData
}: UseVideoPlayerProps) => {
    const [playingVideo, setPlayingVideo] = useState<ProcessedVideo | null>(null);
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
    const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [duration, setDuration] = useState<number>(0);
    const [volume, setVolume] = useState<number>(1);
    const [showControls, setShowControls] = useState<boolean>(true);
    const [controlsTimeout, setControlsTimeout] = useState<number | null>(null);
    const [subtitlesEnabled, setSubtitlesEnabled] = useState<boolean>(false);
    const [subtitlesAvailable, setSubtitlesAvailable] = useState<boolean>(false);
    const [currentSubtitle, setCurrentSubtitle] = useState<string>("");
    const [isIconChanging, setIsIconChanging] = useState<boolean>(false);
    const [subtitles, setSubtitles] = useState<Subtitle[]>([]);

    // Initialize playback for selected video (loads subtitles if found)
    const handlePlayVideo = async (video: ProcessedVideo) => {
        setPlayingVideo(video);
        setShowVideoPlayer(true);
        setPlaybackSpeed(1);
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setVolume(1);
        setShowControls(true);
        setCurrentSubtitle("");

    // Reset subtitle state
        setSubtitles([]);
        setSubtitlesAvailable(false);
        setSubtitlesEnabled(false);

    // Load & parse subtitles if available
        try {
            const subtitleData = await checkAndLoadSubtitles(video.file_path);
            if (subtitleData) {
                const parsedSubtitles = parseSubtitles(subtitleData);
                
                if (parsedSubtitles.length > 0) {
                    setSubtitles(parsedSubtitles);
                    setSubtitlesAvailable(true);
                    setSubtitlesEnabled(true); // Ativa legendas automaticamente quando detectadas
                }
            }
        } catch (error) {
            console.error('Error loading subtitles:', error);
            setSubtitles([]);
            setSubtitlesAvailable(false);
            setSubtitlesEnabled(false);
        }
    };

    const handleCloseVideoPlayer = () => {
        setShowVideoPlayer(false);
        setPlayingVideo(null);
        setIsFullscreen(false);
        setIsPlaying(false);
        if (controlsTimeout) {
            clearTimeout(controlsTimeout);
            setControlsTimeout(null);
        }
    };

    const handleSpeedChange = (speed: number) => {
        setPlaybackSpeed(speed);
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
            video.playbackRate = speed;
        }
    };

    const toggleFullscreen = async () => {
        try {
            if (!isFullscreen) {
                // Entra em tela cheia real (F11)
                await document.documentElement.requestFullscreen(); // enter real fullscreen
                setIsFullscreen(true);
            } else {
                // Sai da tela cheia real
                await document.exitFullscreen(); // exit real fullscreen
                setIsFullscreen(false);
            }
        } catch (error) {
            console.error('Error toggling fullscreen:', error);
            // Fallback toggle if Fullscreen API errors
            setIsFullscreen(!isFullscreen);
        }
    };

    const togglePlayPause = () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
            // Trigger transient play/pause icon animation
            setIsIconChanging(true);

            setTimeout(() => {
                if (video.paused) {
                    video.play();
                    setIsPlaying(true);
                } else {
                    video.pause();
                    setIsPlaying(false);
                }

                // Remove animation after transition ends
                setTimeout(() => setIsIconChanging(false), 150);
            }, 75); // Half CSS transition duration
        }
    };

    const handleSeek = (time: number) => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
            video.currentTime = time;
            setCurrentTime(time);
        }
    };

    const handleVolumeChange = (newVolume: number) => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
            video.volume = newVolume;
            setVolume(newVolume);
        }
    };

    // Toggle subtitles on/off
    const toggleSubtitles = () => {
        if (subtitlesAvailable) {
            setSubtitlesEnabled(!subtitlesEnabled);
        }
    };

    // Restart controls auto-hide timer
    const resetControlsTimeout = () => {
        if (controlsTimeout) {
            clearTimeout(controlsTimeout);
        }

        setShowControls(true);

    // Only hide in real fullscreen mode
        if (document.fullscreenElement) {
            const timeout = setTimeout(() => {
                setShowControls(false);
            }, 3000);
            setControlsTimeout(timeout);
        }
    };

    // Update currently active subtitle line
    useEffect(() => {
        if (playingVideo && subtitlesEnabled && subtitles.length > 0) {
            const newSubtitle = getCurrentSubtitle(currentTime, subtitles, subtitlesEnabled);
            if (newSubtitle !== currentSubtitle) {
                setCurrentSubtitle(newSubtitle);
            }
        } else {
            if (currentSubtitle !== "") {
                setCurrentSubtitle("");
            }
        }
    }, [currentTime, subtitlesEnabled, playingVideo, subtitles, currentSubtitle]);

    // Respond to fullscreen state changes
    useEffect(() => {
        if (document.fullscreenElement) {
            resetControlsTimeout();
        } else {
            setShowControls(true);
            if (controlsTimeout) {
                clearTimeout(controlsTimeout);
                setControlsTimeout(null);
            }
        }
    }, [isFullscreen]);

    // Listen for native fullscreen changes
    useEffect(() => {
        if (!playingVideo) return;

        const handleFullscreenChange = () => {
            const isCurrentlyFullscreen = document.fullscreenElement !== null;
            setIsFullscreen(isCurrentlyFullscreen);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, [playingVideo]);

    // Persist watch progress and mark video watched when threshold hit
    const handleVideoProgress = async (video: ProcessedVideo, currentTime: number) => {
        if (video.id && video.duration_seconds && currentTime > 0) {
            try {
                await updateWatchProgress(video.id, currentTime, video.duration_seconds);

                // Se atingiu 75%, marcar como assistido
                const watchedThreshold = video.duration_seconds * 0.75;
                if (currentTime >= watchedThreshold && !video.is_watched) {
                    const updatedVideo = {...video, is_watched: true, watch_progress_seconds: currentTime};

                    setProcessedVideos(prev => prev.map(v =>
                        v.file_path === video.file_path ? updatedVideo : v
                    ));

                    await loadHomePageData();
                }
            } catch (error) {
                console.error('Error updating video progress:', error);
            }
        }
    };

    return {
        // Estados
        playingVideo,
        setPlayingVideo,
        playbackSpeed,
        isFullscreen,
        isPlaying,
        setIsPlaying,
        currentTime,
        setCurrentTime,
        duration,
        setDuration,
        volume,
        showControls,
        subtitlesEnabled,
        setSubtitlesEnabled,
        subtitlesAvailable,
        setSubtitlesAvailable,
        currentSubtitle,
        isIconChanging,
        subtitles,
        setSubtitles,

        // Funções
        handlePlayVideo,
        handleCloseVideoPlayer,
        handleSpeedChange,
        toggleFullscreen,
        togglePlayPause,
        handleSeek,
        handleVolumeChange,
        toggleSubtitles,
        resetControlsTimeout,
        handleVideoProgress
    };
};
