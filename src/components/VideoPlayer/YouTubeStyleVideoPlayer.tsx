import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { ProcessedVideo } from "../../types/video";
import { formatDuration } from "../../utils/videoUtils";

interface YouTubeStyleVideoPlayerProps {
    video: ProcessedVideo;
    playlistVideos: ProcessedVideo[];
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    playbackSpeed: number;
    isFullscreen: boolean;
    showControls: boolean;
    subtitlesEnabled: boolean;
    subtitlesAvailable: boolean;
    currentSubtitle: string;
    isIconChanging: boolean;
    onClose: () => void;
    onTogglePlayPause: () => void;
    onSeek: (time: number) => void;
    onVolumeChange: (volume: number) => void;
    onSpeedChange: (speed: number) => void;
    onToggleFullscreen: () => void;
    onToggleSubtitles: () => void;
    onVideoProgress: (video: ProcessedVideo, currentTime: number) => void;
    onVideoEnded: () => void;
    onLoadedMetadata: (duration: number, playbackSpeed: number, volume: number) => void;
    onPlay: () => void;
    onPause: () => void;
    onPlayVideo: (video: ProcessedVideo) => void;
    onToggleWatchedStatus: (video: ProcessedVideo) => void;
    onOpenProperties: (video: ProcessedVideo) => void;
    formatTime: (seconds: number) => string;
    resetControlsTimeout: () => void;
}
// Provided rewind 10s SVG adapted to currentColor & React (we mirror with CSS for forward)
const Rewind10Icon = () => (
    <svg className="w-8 h-8" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" strokeWidth={3} stroke="currentColor">
        <polyline points="9.57 15.41 12.17 24.05 20.81 21.44" strokeLinecap="round" />
        <path d="M26.93,41.41V23a.09.09,0,0,0-.16-.07s-2.58,3.69-4.17,4.78" strokeLinecap="round" />
        <rect x="32.19" y="22.52" width="11.41" height="18.89" rx="5.7" />
        <path d="M12.14,23.94a21.91,21.91,0,1,1-.91,13.25" strokeLinecap="round" />
    </svg>
);

const Forward10Icon = () => (
    <svg className="w-8 h-8" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" strokeWidth={3} stroke="currentColor">
        <path d="M23.93,41.41V23a.09.09,0,0,0-.16-.07s-2.58,3.69-4.17,4.78" strokeLinecap="round" />
        <rect x="29.19" y="22.52" width="11.41" height="18.89" rx="5.7" />
        <polyline points="54.43 15.41 51.83 24.05 43.19 21.44" strokeLinecap="round" />
        <path d="M51.86,23.94a21.91,21.91,0,1,0,.91,13.25" strokeLinecap="round" />
    </svg>
);

export default function YouTubeStyleVideoPlayer({
    video,
    playlistVideos,
    isPlaying,
    currentTime,
    duration,
    volume,
    playbackSpeed,
    isFullscreen,
    showControls,
    subtitlesEnabled,
    subtitlesAvailable,
    currentSubtitle,
    isIconChanging,
    onClose,
    onTogglePlayPause,
    onSeek,
    onVolumeChange,
    onSpeedChange,
    onToggleFullscreen,
    onToggleSubtitles,
    onVideoProgress,
    onVideoEnded,
    onLoadedMetadata,
    onPlay,
    onPause,
    onPlayVideo,
    onToggleWatchedStatus,
    onOpenProperties,
    formatTime,
    resetControlsTimeout
}: YouTubeStyleVideoPlayerProps) {
    // Determine up-next playlist slice
    const currentIndex = playlistVideos.findIndex(v => v.file_path === video.file_path);
    const nextVideos = currentIndex !== -1 
    ? playlistVideos.slice(currentIndex + 1, currentIndex + 7)
    : playlistVideos.slice(0, 6);

    // Keep last non-zero volume to restore after mute
    const lastVolumeRef = useRef(volume || 1);
    if (volume > 0) lastVolumeRef.current = volume; // update when not muted

    // Skip indicator state (forward/back)
    const [skipIndicator, setSkipIndicator] = useState<{ dir: 'back' | 'forward'; amount: number } | null>(null);
    const skipTimeoutRef = useRef<number | null>(null);

    const showSkipIndicator = (delta: number) => {
        const dir = delta < 0 ? 'back' : 'forward';
        const amount = Math.abs(delta);
        setSkipIndicator({ dir, amount });
        if (skipTimeoutRef.current) {
            window.clearTimeout(skipTimeoutRef.current);
        }
        skipTimeoutRef.current = window.setTimeout(() => {
            setSkipIndicator(null);
            skipTimeoutRef.current = null;
        }, 650);
    };

    const handleSeekDelta = (delta: number) => {
        const newTime = Math.min(Math.max(0, currentTime + delta), duration);
        onSeek(newTime);
        showSkipIndicator(delta);
        resetControlsTimeout();
    };

    // Keyboard shortcuts (YouTube style)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Avoid typing conflicts
            const target = e.target as HTMLElement | null;
            if (target) {
                const tag = target.tagName.toLowerCase();
                if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return;
                if (tag === 'select') return;
            }
            const key = e.key.toLowerCase();

            const seek = (delta: number) => {
                handleSeekDelta(delta);
            };
            const changeVolume = (delta: number) => {
                const newVol = Math.min(1, Math.max(0, volume + delta));
                onVolumeChange(Number(newVol.toFixed(2)));
            };

            switch (key) {
                case 'j': // Back 10s
                    e.preventDefault();
                    seek(-10);
                    break;
                case 'l': // Forward 10s
                    e.preventDefault();
                    seek(10);
                    break;
                case 'k': // toggle play
                case ' ': // space
                    e.preventDefault();
                    onTogglePlayPause();
                    break;
                case 'c':
                    e.preventDefault();
                    if (subtitlesAvailable) onToggleSubtitles();
                    break;
                case 'm':
                    e.preventDefault();
                    if (volume > 0) {
                        onVolumeChange(0);
                    } else {
                        onVolumeChange(lastVolumeRef.current || 1);
                    }
                    break;
                case 'f':
                    e.preventDefault();
                    onToggleFullscreen();
                    break;
                case 'arrowleft': // Back 5s
                    e.preventDefault();
                    seek(-5);
                    break;
                case 'arrowright': // Forward 5s
                    e.preventDefault();
                    seek(5);
                    break;
                case 'arrowup':
                    e.preventDefault();
                    changeVolume(0.05);
                    break;
                case 'arrowdown':
                    e.preventDefault();
                    changeVolume(-0.05);
                    break;
                default:
                    return;
            }
            // Any interaction resets control hide timer
            resetControlsTimeout();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [currentTime, duration, volume, subtitlesAvailable, onSeek, onTogglePlayPause, onToggleSubtitles, onToggleFullscreen, onVolumeChange, resetControlsTimeout]);

    if (isFullscreen) {
    // Fullscreen mode (minimal chrome)
        return (
            <div
                className="fixed inset-0 bg-black z-[100] flex flex-col"
                onMouseMove={resetControlsTimeout}
                onClick={resetControlsTimeout}
            >
                {/* Video element */}
                <div className="flex-1 relative bg-black">
                    <video
                        src={convertFileSrc(video.file_path)}
                        className="w-full h-full object-contain"
                        autoPlay
                        preload="metadata"
                        onLoadedMetadata={(e) => {
                            const videoElement = e.currentTarget;
                            onLoadedMetadata(videoElement.duration, playbackSpeed, volume);
                            videoElement.playbackRate = playbackSpeed;
                            videoElement.volume = volume;
                        }}
                        onTimeUpdate={(e) => {
                            const videoElement = e.currentTarget;
                            onVideoProgress(video, videoElement.currentTime);
                        }}
                        onPlay={onPlay}
                        onPause={onPause}
                        onEnded={onVideoEnded}
                        onClick={onTogglePlayPause}
                    />

                    {/* Subtitles */}
                    {subtitlesEnabled && currentSubtitle && (
                        <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-75 text-white px-4 py-2 rounded max-w-3xl text-center">
                            {currentSubtitle}
                        </div>
                    )}

                    {/* Transitional play/pause icon */}
                    {isIconChanging && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="rounded-full p-4 animate-fade-in-out center-indicator-bg">
                                {isPlaying ? (
                                    <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                                    </svg>
                                ) : (
                                    <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M8 5v14l11-7z"/>
                                    </svg>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Skip indicators */}
                    {skipIndicator && (
                        <div className="absolute inset-0 pointer-events-none select-none">
                            {skipIndicator.dir === 'back' && (
                                <div className="absolute top-1/2 -translate-y-1/2 skip-indicator skip-indicator-left text-white flex flex-col items-center gap-1 center-indicator-bg rounded-xl px-4 py-3 shadow-lg">
                                    <div className="flex items-center gap-2 text-lg font-semibold">
                                        <span className="text-xl">⏪</span>
                                        <span className="amount">{skipIndicator.amount}s</span>
                                    </div>
                                    {/* removed key label */}
                                </div>
                            )}
                            {skipIndicator.dir === 'forward' && (
                                <div className="absolute top-1/2 -translate-y-1/2 skip-indicator skip-indicator-right text-white flex flex-col items-center gap-1 center-indicator-bg rounded-xl px-4 py-3 shadow-lg">
                                    <div className="flex items-center gap-2 text-lg font-semibold">
                                        <span className="amount">{skipIndicator.amount}s</span>
                                        <span className="text-xl">⏩</span>
                                    </div>
                                    {/* removed key label */}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Overlay controls */}
                    <div
                        className={`absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                        onClick={(e) => {
                            // Only toggle if background (not a control) is clicked
                            if (e.target === e.currentTarget) {
                                onTogglePlayPause();
                            }
                        }}
                    >
                        {/* Progress bar */}
                        <div className="absolute bottom-16 left-4 right-4">
                            <div className="flex items-center space-x-2 text-white text-sm mb-2">
                                <span>{formatTime(currentTime)}</span>
                                <div className="flex-1 bg-gray-600 rounded-full h-1 cursor-pointer" onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const percent = (e.clientX - rect.left) / rect.width;
                                    onSeek(percent * duration);
                                }}>
                                    <div 
                                        className="bg-blue-500 h-1 rounded-full transition-all duration-100"
                                        style={{width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`}}
                                    ></div>
                                </div>
                                <span>{formatTime(duration)}</span>
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                                {/* Play/Pause */}
                                {/* Rewind 10s */}
                                <button
                                    onClick={() => handleSeekDelta(-10)}
                                    className="text-white hover:text-blue-400 transition-all duration-200 hover:scale-110"
                                    title="Back 10s (J)"
                                    aria-label="Back 10 seconds"
                                >
                                    <Rewind10Icon />
                                </button>
                                <button
                                    onClick={onTogglePlayPause}
                                    className="text-white hover:text-blue-400 transition-all duration-200 hover:scale-110"
                                    title={isPlaying ? "Pause (Space)" : "Play (Space)"}
                                >
                                    {isPlaying ? (
                                        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                                        </svg>
                                    ) : (
                                        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z"/>
                                        </svg>
                                    )}
                                </button>
                                {/* Forward 10s */}
                                <button
                                    onClick={() => handleSeekDelta(10)}
                                    className="text-white hover:text-blue-400 transition-all duration-200 hover:scale-110"
                                    title="Forward 10s (L)"
                                    aria-label="Forward 10 seconds"
                                >
                                    <Forward10Icon />
                                </button>

                                {/* Volume */}
                                <div className="flex items-center space-x-2">
                                    <button
                                        onClick={() => onVolumeChange(volume > 0 ? 0 : 1)}
                                        className="text-white hover:text-blue-400 transition-all duration-200 hover:scale-110"
                                        title="Toggle Mute (M)"
                                    >
                                        {volume === 0 ? (
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                                      d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" 
                                                      clipRule="evenodd"/>
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>
                                            </svg>
                                        ) : volume < 0.5 ? (
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                      d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
                                            </svg>
                                        ) : (
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                      d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
                                            </svg>
                                        )}
                                    </button>
                                    <input
                                        type="range"
                                        min={0}
                                        max={1}
                                        step={0.1}
                                        value={volume}
                                        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                                        className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                                        title="Volume"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center space-x-4">
                                {/* Subtitles */}
                                <button
                                    onClick={onToggleSubtitles}
                                    className={`transition-all duration-200 hover:scale-110 ${
                                        subtitlesAvailable 
                                            ? (subtitlesEnabled ? 'text-blue-400' : 'text-white hover:text-blue-400')
                                            : 'text-gray-500 cursor-not-allowed'
                                    }`}
                                    title={subtitlesAvailable ? "Toggle Subtitles (C)" : "No subtitles available"}
                                    disabled={!subtitlesAvailable}
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                                        {subtitlesEnabled && (
                                            <circle cx="18" cy="6" r="3" fill="currentColor" className="text-blue-400"/>
                                        )}
                                    </svg>
                                </button>

                                {/* Playback speed */}
                                <select
                                    value={playbackSpeed}
                                    onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
                                    className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                                    title="Playback Speed"
                                >
                                    <option value={0.25}>0.25x</option>
                                    <option value={0.5}>0.5x</option>
                                    <option value={0.75}>0.75x</option>
                                    <option value={1}>1x</option>
                                    <option value={1.25}>1.25x</option>
                                    <option value={1.5}>1.5x</option>
                                    <option value={1.75}>1.75x</option>
                                    <option value={2}>2x</option>
                                </select>

                                {/* Exit Fullscreen */}
                                <button
                                    onClick={onToggleFullscreen}
                                    className="text-white hover:text-blue-400 transition-all duration-200 hover:scale-110"
                                    title="Exit Fullscreen (F)"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                              d="M9 9V4.5M9 9H4.5M9 9L3.5 3.5M15 9h4.5M15 9V4.5M15 9l5.5-5.5M9 15v4.5M9 15H4.5M9 15l-5.5 5.5M15 15h4.5M15 15v4.5m0-4.5l5.5 5.5"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Windowed (YouTube-style) layout
    return (
        <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
                <h3 className="text-white font-medium truncate">{video.title}</h3>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-white transition-colors ml-4"
                    title="Close (Esc)"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>

            {/* Main content area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: player area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Video container */}
                    <div className="bg-black relative" style={{ aspectRatio: '16/9' }}>
                        <video
                            src={convertFileSrc(video.file_path)}
                            className="w-full h-full object-contain"
                            autoPlay
                            preload="metadata"
                            onLoadedMetadata={(e) => {
                                const videoElement = e.currentTarget;
                                onLoadedMetadata(videoElement.duration, playbackSpeed, volume);
                                videoElement.playbackRate = playbackSpeed;
                                videoElement.volume = volume;
                            }}
                            onTimeUpdate={(e) => {
                                const videoElement = e.currentTarget;
                                onVideoProgress(video, videoElement.currentTime);
                            }}
                            onPlay={onPlay}
                            onPause={onPause}
                            onEnded={onVideoEnded}
                            onClick={onTogglePlayPause}
                            onMouseMove={resetControlsTimeout}
                        />

                        {/* Subtitles */}
                        {subtitlesEnabled && currentSubtitle && (
                            <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-75 text-white px-4 py-2 rounded max-w-3xl text-center">
                                {currentSubtitle}
                            </div>
                        )}

                        {/* Transitional play/pause icon */}
                        {isIconChanging && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="rounded-full p-4 animate-fade-in-out center-indicator-bg">
                                    {isPlaying ? (
                                        <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                                        </svg>
                                    ) : (
                                        <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z"/>
                                        </svg>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Skip indicators */}
                        {skipIndicator && (
                            <div className="absolute inset-0 pointer-events-none select-none">
                                {skipIndicator.dir === 'back' && (
                                    <div className="absolute top-1/2 -translate-y-1/2 skip-indicator skip-indicator-left text-white flex flex-col items-center gap-1 center-indicator-bg rounded-xl px-4 py-3 shadow-lg">
                                        <div className="flex items-center gap-2 text-lg font-semibold">
                                            <span className="text-xl">⏪</span>
                                            <span className="amount">{skipIndicator.amount}s</span>
                                        </div>
                                        {/* removed key label */}
                                    </div>
                                )}
                                {skipIndicator.dir === 'forward' && (
                                    <div className="absolute top-1/2 -translate-y-1/2 skip-indicator skip-indicator-right text-white flex flex-col items-center gap-1 center-indicator-bg rounded-xl px-4 py-3 shadow-lg">
                                        <div className="flex items-center gap-2 text-lg font-semibold">
                                            <span className="amount">{skipIndicator.amount}s</span>
                                            <span className="text-xl">⏩</span>
                                        </div>
                                        {/* removed key label */}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Custom Controls Overlay */}
                        <div
                            className={`absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                            onClick={(e) => {
                                if (e.target === e.currentTarget) {
                                    onTogglePlayPause();
                                }
                            }}
                        >
                            {/* Progress bar */}
                            <div className="absolute bottom-16 left-4 right-4">
                                <div className="flex items-center space-x-2 text-white text-sm mb-2">
                                    <span>{formatTime(currentTime)}</span>
                                    <div className="flex-1 bg-gray-600 rounded-full h-1 cursor-pointer" onClick={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const percent = (e.clientX - rect.left) / rect.width;
                                        onSeek(percent * duration);
                                    }}>
                                        <div 
                                            className="bg-blue-500 h-1 rounded-full transition-all duration-100"
                                            style={{width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`}}
                                        ></div>
                                    </div>
                                    <span>{formatTime(duration)}</span>
                                </div>
                            </div>

                            {/* Controls */}
                            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                                <div className="flex items-center space-x-4">
                                    {/* Play/Pause */}
                                    {/* Rewind 10s */}
                                    <button
                                        onClick={() => handleSeekDelta(-10)}
                                        className="text-white hover:text-blue-400 transition-all duration-200 hover:scale-110"
                                        title="Back 10s (J)"
                                        aria-label="Back 10 seconds"
                                    >
                                        <Rewind10Icon />
                                    </button>
                                    <button
                                        onClick={onTogglePlayPause}
                                        className="text-white hover:text-blue-400 transition-all duration-200 hover:scale-110"
                                        title={isPlaying ? "Pause (Space)" : "Play (Space)"}
                                    >
                                        {isPlaying ? (
                                            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                                            </svg>
                                        ) : (
                                            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M8 5v14l11-7z"/>
                                            </svg>
                                        )}
                                    </button>
                                    {/* Forward 10s */}
                                    <button
                                        onClick={() => handleSeekDelta(10)}
                                        className="text-white hover:text-blue-400 transition-all duration-200 hover:scale-110"
                                        title="Forward 10s (L)"
                                        aria-label="Forward 10 seconds"
                                    >
                                        <Forward10Icon />
                                    </button>

                                    {/* Volume */}
                                    <div className="flex items-center space-x-2">
                                        <button
                                            onClick={() => onVolumeChange(volume > 0 ? 0 : 1)}
                                            className="text-white hover:text-blue-400 transition-all duration-200 hover:scale-110"
                                            title="Toggle Mute (M)"
                                        >
                                            {volume === 0 ? (
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                                          d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" 
                                                          clipRule="evenodd"/>
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>
                                                </svg>
                                            ) : volume < 0.5 ? (
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                          d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
                                                </svg>
                                            ) : (
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                          d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
                                                </svg>
                                            )}
                                        </button>
                                        <input
                                            type="range"
                                            min={0}
                                            max={1}
                                            step={0.1}
                                            value={volume}
                                            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                                            className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                                            title="Volume"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center space-x-4">
                                    {/* Subtitles */}
                                    <button
                                        onClick={onToggleSubtitles}
                                        className={`transition-all duration-200 hover:scale-110 ${
                                            subtitlesAvailable 
                                                ? (subtitlesEnabled ? 'text-blue-400' : 'text-white hover:text-blue-400')
                                                : 'text-gray-500 cursor-not-allowed'
                                        }`}
                                        title={subtitlesAvailable ? "Toggle Subtitles (C)" : "No subtitles available"}
                                        disabled={!subtitlesAvailable}
                                    >
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                                            {subtitlesEnabled && (
                                                <circle cx="18" cy="6" r="3" fill="currentColor" className="text-blue-400"/>
                                            )}
                                        </svg>
                                    </button>

                                    {/* Velocidade */}
                                    <select
                                        value={playbackSpeed}
                                        onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
                                        className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                                        title="Playback Speed"
                                    >
                                        <option value={0.25}>0.25x</option>
                                        <option value={0.5}>0.5x</option>
                                        <option value={0.75}>0.75x</option>
                                        <option value={1}>1x</option>
                                        <option value={1.25}>1.25x</option>
                                        <option value={1.5}>1.5x</option>
                                        <option value={1.75}>1.75x</option>
                                        <option value={2}>2x</option>
                                    </select>

                                    {/* Fullscreen */}
                                    <button
                                        onClick={onToggleFullscreen}
                                        className="text-white hover:text-blue-400 transition-all duration-200 hover:scale-110"
                                        title="Toggle Fullscreen (F)"
                                    >
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 1v4m0 0h-4m4 0l-5-5"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Video information */}
                    <div className="p-4 bg-gray-800 border-b border-gray-700">
                        <h2 className="text-xl font-semibold text-white mb-2">{video.title}</h2>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4 text-gray-300 text-sm">
                                <span>Duration: {formatDuration(video.duration_seconds || 0)}</span>
                                {video.watch_progress_seconds && video.watch_progress_seconds > 0 && !video.is_watched && (
                                    <span>Progress: {formatDuration(video.watch_progress_seconds)}</span>
                                )}
                            </div>
                            
                            {/* Action buttons */}
                            <div className="flex items-center space-x-3">
                                <button
                                    onClick={() => onToggleWatchedStatus(video)}
                                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-colors text-sm ${
                                        video.is_watched 
                                            ? 'bg-green-600 hover:bg-green-700 text-white' 
                                            : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                    }`}
                                    title={video.is_watched ? "Mark as unwatched" : "Mark as watched"}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                                    </svg>
                                    <span>{video.is_watched ? 'Watched' : 'Mark as Watched'}</span>
                                </button>
                                
                                <button
                                    onClick={() => onOpenProperties(video)}
                                    className="flex items-center space-x-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors text-sm"
                                    title="Video Properties"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                    </svg>
                                    <span>Properties</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Video info and controls */}
                    <div className="flex-1 p-4 bg-gray-800 overflow-y-auto">
                        {/* Description */}
                        {video.description && (
                            <div>
                                <h3 className="text-lg font-medium text-white mb-2">Description</h3>
                                <p className="text-gray-300 whitespace-pre-wrap">{video.description}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right sidebar - Next videos */}
                <div className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col">
                    <div className="p-4 border-b border-gray-700">
                        <h3 className="text-lg font-semibold text-white">Up Next</h3>
                        <p className="text-sm text-gray-400">{nextVideos.length} videos</p>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto">
                        {nextVideos.map((nextVideo) => (
                            <div
                                key={nextVideo.file_path}
                                className="p-3 border-b border-gray-700 hover:bg-gray-700 cursor-pointer transition-colors"
                                onClick={() => onPlayVideo(nextVideo)}
                            >
                                <div className="flex space-x-3">
                                    {/* Thumbnail */}
                                    <div className="flex-shrink-0 w-32 h-18 bg-gray-700 rounded relative">
                                        {nextVideo.thumbnail_path ? (
                                            <img
                                                src={convertFileSrc(nextVideo.thumbnail_path)}
                                                alt={nextVideo.title}
                                                className="w-full h-full object-cover rounded"
                                                onError={(e) => {
                                                    const parent = e.currentTarget.parentElement;
                                                    if (parent) {
                                                        e.currentTarget.style.display = 'none';
                                                        const fallbackIcon = parent.querySelector('.fallback-icon');
                                                        if (fallbackIcon) {
                                                            (fallbackIcon as HTMLElement).style.display = 'flex';
                                                        }
                                                    }
                                                }}
                                            />
                                        ) : null}
                                        
                                        {/* Fallback icon */}
                                        <div
                                            className={`fallback-icon absolute inset-0 flex items-center justify-center ${
                                                nextVideo.thumbnail_path ? 'hidden' : 'flex'
                                            }`}
                                        >
                                            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                                            </svg>
                                        </div>

                                        {/* Duration */}
                                        {nextVideo.duration_seconds && nextVideo.duration_seconds > 0 && (
                                            <div className="absolute bottom-1 right-1 bg-black bg-opacity-75 text-white text-xs px-1 rounded">
                                                {formatDuration(nextVideo.duration_seconds)}
                                            </div>
                                        )}

                                        {/* Progress bar */}
                                        {nextVideo.watch_progress_seconds != null && nextVideo.watch_progress_seconds > 0 && nextVideo.duration_seconds && !nextVideo.is_watched && (
                                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-600 rounded-b">
                                                <div
                                                    className="h-full bg-blue-500 rounded-bl"
                                                    style={{width: `${(nextVideo.watch_progress_seconds / nextVideo.duration_seconds) * 100}%`}}
                                                ></div>
                                            </div>
                                        )}

                                        {/* Watched indicator */}
                                        {nextVideo.is_watched && (
                                            <div className="absolute top-1 right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                                                </svg>
                                            </div>
                                        )}
                                    </div>

                                    {/* Video info */}
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-medium text-white mb-1 leading-tight overflow-hidden" 
                                            style={{
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                                textOverflow: 'ellipsis'
                                            }}
                                            title={nextVideo.title}>
                                            {nextVideo.title}
                                        </h4>
                                        <div className="text-xs text-gray-400 space-y-1">
                                            {nextVideo.duration_seconds && (
                                                <div>{formatDuration(nextVideo.duration_seconds)}</div>
                                            )}
                                            {nextVideo.watch_progress_seconds && nextVideo.watch_progress_seconds > 0 && !nextVideo.is_watched && (
                                                <div className="text-blue-400">
                                                    {Math.round((nextVideo.watch_progress_seconds / (nextVideo.duration_seconds || 1)) * 100)}% watched
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        
                        {nextVideos.length === 0 && (
                            <div className="p-6 text-center text-gray-400">
                                <svg className="w-12 h-12 mx-auto mb-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                                </svg>
                                <p>No more videos in this folder</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
