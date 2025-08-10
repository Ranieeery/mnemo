import { useState, useEffect, useRef } from 'react';
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
    const lastVideoRef = useRef<ProcessedVideo | null>(null);
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

    const handlePlayVideo = async (video: ProcessedVideo) => {
    setPlayingVideo(video);
    lastVideoRef.current = video;
        setShowVideoPlayer(true);
        setPlaybackSpeed(1);
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setVolume(1);
        setShowControls(true);
        setCurrentSubtitle("");

        setSubtitles([]);
        setSubtitlesAvailable(false);
        setSubtitlesEnabled(false);

        try {
            const subtitleData = await checkAndLoadSubtitles(video.file_path);
            if (subtitleData) {
                const parsedSubtitles = parseSubtitles(subtitleData);
                
                if (parsedSubtitles.length > 0) {
                    setSubtitles(parsedSubtitles);
                    setSubtitlesAvailable(true);
                    setSubtitlesEnabled(true);
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

    const reopenLastVideo = () => {
        if (lastVideoRef.current) {
            handlePlayVideo(lastVideoRef.current);
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
                await document.documentElement.requestFullscreen();
                setIsFullscreen(true);
            } else {
                await document.exitFullscreen();
                setIsFullscreen(false);
            }
        } catch (error) {
            console.error('Error toggling fullscreen:', error);
            setIsFullscreen(!isFullscreen);
        }
    };

    const togglePlayPause = () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
            setIsIconChanging(true);

            setTimeout(() => {
                if (video.paused) {
                    video.play();
                    setIsPlaying(true);
                } else {
                    video.pause();
                    setIsPlaying(false);
                }

                setTimeout(() => setIsIconChanging(false), 150);
            }, 75);
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

    const toggleSubtitles = () => {
        if (subtitlesAvailable) {
            setSubtitlesEnabled(!subtitlesEnabled);
        }
    };

    const resetControlsTimeout = () => {
        if (controlsTimeout) {
            clearTimeout(controlsTimeout);
        }

        setShowControls(true);

        if (document.fullscreenElement) {
            const timeout = setTimeout(() => {
                setShowControls(false);
            }, 3000);
            setControlsTimeout(timeout);
        }
    };

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

    const handleVideoProgress = async (video: ProcessedVideo, currentTime: number) => {
        if (video.id && video.duration_seconds && currentTime > 0) {
            try {
                await updateWatchProgress(video.id, currentTime, video.duration_seconds);

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
    ,
    reopenLastVideo
    };
};
