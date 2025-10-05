import { convertFileSrc } from "@tauri-apps/api/core";
import { ProcessedVideo } from "../../types/video";

interface VideoPlayerProps {
    video: ProcessedVideo;
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
    formatTime: (seconds: number) => string;
    resetControlsTimeout: () => void;
}

export default function VideoPlayer({
    video,
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
    formatTime,
    resetControlsTimeout,
}: VideoPlayerProps) {
    return (
        <div
            className={`fixed inset-0 bg-black z-50 flex flex-col ${isFullscreen ? "z-[100]" : ""}`}
            onMouseMove={resetControlsTimeout}
            onClick={resetControlsTimeout}
        >
            {!isFullscreen && (
                <div className="flex items-center justify-between p-4 bg-gray-900">
                    <h3 className="text-white font-medium truncate">{video.title}</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors ml-4"
                        title="Close (Esc)"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>
            )}

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
                >
                    Your browser does not support the video tag.
                </video>

                {subtitlesEnabled && currentSubtitle && (
                    <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 max-w-4xl">
                        <div className="bg-black bg-opacity-75 text-white text-center px-4 py-2 rounded-lg text-lg leading-tight">
                            {currentSubtitle.split("\n").map((line, index) => (
                                <div key={index}>{line}</div>
                            ))}
                        </div>
                    </div>
                )}

                <div
                    className="absolute inset-0 flex items-center justify-center cursor-pointer"
                    onClick={onTogglePlayPause}
                >
                    <div
                        className={`transition-all duration-300 ${isIconChanging ? "scale-125 opacity-100" : "scale-100 opacity-0"}`}
                    >
                        <div className="bg-black bg-opacity-50 rounded-full p-4">
                            {isPlaying ? (
                                <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                </svg>
                            ) : (
                                <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            )}
                        </div>
                    </div>
                </div>

                <div
                    className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/90 to-transparent p-4 transition-all duration-300 ${
                        document.fullscreenElement && !showControls
                            ? "opacity-0 pointer-events-none transform translate-y-4"
                            : "opacity-100 transform translate-y-0"
                    }`}
                >
                    <div className="mb-4">
                        <input
                            type="range"
                            min="0"
                            max={duration || 0}
                            value={currentTime}
                            onChange={(e) => onSeek(parseFloat(e.target.value))}
                            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                            style={{
                                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${duration ? (currentTime / duration) * 100 : 0}%, #4b5563 ${duration ? (currentTime / duration) * 100 : 0}%, #4b5563 100%)`,
                            }}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <button
                                onClick={onTogglePlayPause}
                                className="play-pause-button text-white hover:text-blue-400 transition-colors"
                                title="Play/Pause (Space)"
                            >
                                {isPlaying ? (
                                    <svg
                                        className={`w-8 h-8 play-pause-icon ${isIconChanging ? "changing" : ""}`}
                                        fill="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                    </svg>
                                ) : (
                                    <svg
                                        className={`w-8 h-8 play-pause-icon ${isIconChanging ? "changing" : ""}`}
                                        fill="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                )}
                            </button>

                            <div className="flex items-center space-x-2 group">
                                <button
                                    onClick={() => onVolumeChange(volume > 0 ? 0 : 1)}
                                    className="text-white hover:text-blue-400 transition-colors"
                                    title="Mute/Unmute"
                                >
                                    {volume === 0 ? (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                            />
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                                            />
                                        </svg>
                                    ) : volume < 0.5 ? (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                            />
                                        </svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                            />
                                        </svg>
                                    )}
                                </button>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={volume}
                                    onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                                    className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider opacity-70 group-hover:opacity-100 transition-opacity"
                                    style={{
                                        background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${volume * 100}%, #4b5563 ${volume * 100}%, #4b5563 100%)`,
                                    }}
                                />
                            </div>

                            <div className="text-white text-sm font-mono">
                                {formatTime(currentTime)} / {formatTime(duration)}
                            </div>
                        </div>

                        <div className="flex items-center space-x-3">
                            <button
                                onClick={onToggleSubtitles}
                                disabled={!subtitlesAvailable}
                                className={`transition-colors ${
                                    !subtitlesAvailable
                                        ? "text-gray-600 cursor-not-allowed"
                                        : subtitlesEnabled
                                          ? "text-blue-400 hover:text-blue-300"
                                          : "text-white hover:text-blue-400"
                                }`}
                                title={
                                    !subtitlesAvailable
                                        ? "No subtitles available"
                                        : subtitlesEnabled
                                          ? "Hide subtitles"
                                          : "Show subtitles"
                                }
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                    />
                                    {subtitlesEnabled && (
                                        <circle cx="18" cy="6" r="3" fill="currentColor" className="text-blue-400" />
                                    )}
                                </svg>
                            </button>

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

                            <button
                                onClick={onToggleFullscreen}
                                className="text-white hover:text-blue-400 transition-all duration-200 hover:scale-110"
                                title="Toggle Fullscreen (F)"
                            >
                                {isFullscreen ? (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M9 9V4.5M9 9H4.5M9 9L3.5 3.5M15 9h4.5M15 9V4.5M15 9l5.5-5.5M9 15v4.5M9 15H4.5M9 15l-5.5 5.5M15 15h4.5M15 15v4.5m0-4.5l5.5 5.5"
                                        />
                                    </svg>
                                ) : (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 1v4m0 0h-4m4 0l-5-5"
                                        />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
