import { useState, useEffect } from 'react';
import { ProcessedVideo } from '../services/videoProcessor';
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

    // Funções do player de vídeo interno
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

        // Verifica e carrega legendas
        const subtitleData = await checkAndLoadSubtitles(video.file_path);
        if (subtitleData) {
            const parsedSubtitles = parseSubtitles(subtitleData);
            setSubtitles(parsedSubtitles);
            setSubtitlesAvailable(true);
            setSubtitlesEnabled(true); // Ativa legendas automaticamente quando detectadas
        } else {
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
                await document.documentElement.requestFullscreen();
                setIsFullscreen(true);
            } else {
                // Sai da tela cheia real
                await document.exitFullscreen();
                setIsFullscreen(false);
            }
        } catch (error) {
            console.error('Error toggling fullscreen:', error);
            // Fallback para método simples se API não funcionar
            setIsFullscreen(!isFullscreen);
        }
    };

    const togglePlayPause = () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
            // Ativa a animação de transição
            setIsIconChanging(true);

            setTimeout(() => {
                if (video.paused) {
                    video.play();
                    setIsPlaying(true);
                } else {
                    video.pause();
                    setIsPlaying(false);
                }

                // Remove a animação após a mudança
                setTimeout(() => setIsIconChanging(false), 150);
            }, 75); // Metade da duração da transição CSS
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

    // Função para alternar legendas
    const toggleSubtitles = () => {
        if (subtitlesAvailable) {
            setSubtitlesEnabled(!subtitlesEnabled);
        }
    };

    // Auto-hide controls em fullscreen
    const resetControlsTimeout = () => {
        if (controlsTimeout) {
            clearTimeout(controlsTimeout);
        }

        setShowControls(true);

        // Só esconde controles se estiver em fullscreen REAL
        if (document.fullscreenElement) {
            const timeout = setTimeout(() => {
                setShowControls(false);
            }, 3000);
            setControlsTimeout(timeout);
        }
    };

    // Atualizar legenda atual baseada no tempo do vídeo
    useEffect(() => {
        if (playingVideo && subtitlesEnabled) {
            const newSubtitle = getCurrentSubtitle(currentTime, subtitles, subtitlesEnabled);
            setCurrentSubtitle(newSubtitle);
        } else {
            setCurrentSubtitle("");
        }
    }, [currentTime, subtitlesEnabled, playingVideo, subtitles]);

    // Auto-hide controls em fullscreen
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

    // Listener para detectar mudanças na tela cheia
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

    // Atualizar progresso do vídeo durante reprodução
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
