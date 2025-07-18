import { convertFileSrc } from "@tauri-apps/api/core";
import { ProcessedVideo } from "../../services/videoProcessor";
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
    formatTime: (seconds: number) => string;
    resetControlsTimeout: () => void;
}

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
    formatTime,
    resetControlsTimeout
}: YouTubeStyleVideoPlayerProps) {
    // Filtra próximos vídeos (excluindo o atual) e limita a 6
    const nextVideos = playlistVideos
        .filter(v => v.file_path !== video.file_path)
        .slice(0, 6);

    if (isFullscreen) {
        // Fullscreen mode - layout simples como antes
        return (
            <div
                className="fixed inset-0 bg-black z-[100] flex flex-col"
                onMouseMove={resetControlsTimeout}
                onClick={resetControlsTimeout}
            >
                {/* Video container fullscreen */}
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

                    {/* Subtitles overlay */}
                    {subtitlesEnabled && currentSubtitle && (
                        <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-75 text-white px-4 py-2 rounded max-w-3xl text-center">
                            {currentSubtitle}
                        </div>
                    )}

                    {/* Play/Pause icon overlay */}
                    {isIconChanging && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="bg-black bg-opacity-50 rounded-full p-4 animate-fade-in-out">
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

                    {/* Custom Controls Overlay */}
                    <div className={`absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
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
                                        className="bg-red-600 h-1 rounded-full transition-all duration-100"
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
                                <button
                                    onClick={onTogglePlayPause}
                                    className="text-white hover:text-red-400 transition-all duration-200 hover:scale-110"
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

                                {/* Volume */}
                                <div className="flex items-center space-x-2">
                                    <button
                                        onClick={() => onVolumeChange(volume > 0 ? 0 : 1)}
                                        className="text-white hover:text-red-400 transition-all duration-200 hover:scale-110"
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

                                {/* Exit Fullscreen */}
                                <button
                                    onClick={onToggleFullscreen}
                                    className="text-white hover:text-red-400 transition-all duration-200 hover:scale-110"
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

    // YouTube-style layout para modo não-fullscreen
    return (
        <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
            {/* Header com close button */}
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
                {/* Left side - Video and info */}
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

                        {/* Subtitles overlay */}
                        {subtitlesEnabled && currentSubtitle && (
                            <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-75 text-white px-4 py-2 rounded max-w-3xl text-center">
                                {currentSubtitle}
                            </div>
                        )}

                        {/* Play/Pause icon overlay */}
                        {isIconChanging && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="bg-black bg-opacity-50 rounded-full p-4 animate-fade-in-out">
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

                        {/* Custom Controls Overlay */}
                        <div className={`absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
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
                                            className="bg-red-600 h-1 rounded-full transition-all duration-100"
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
                                    <button
                                        onClick={onTogglePlayPause}
                                        className="text-white hover:text-red-400 transition-all duration-200 hover:scale-110"
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

                                    {/* Volume */}
                                    <div className="flex items-center space-x-2">
                                        <button
                                            onClick={() => onVolumeChange(volume > 0 ? 0 : 1)}
                                            className="text-white hover:text-red-400 transition-all duration-200 hover:scale-110"
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
                                        className="text-white hover:text-red-400 transition-all duration-200 hover:scale-110"
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
                        <div className="flex items-center space-x-4 text-gray-300 text-sm">
                            <span>Duration: {formatDuration(video.duration_seconds || 0)}</span>
                            {video.watch_progress_seconds && video.watch_progress_seconds > 0 && (
                                <span>Progress: {formatDuration(video.watch_progress_seconds)}</span>
                            )}
                            {video.is_watched && (
                                <span className="flex items-center space-x-1 text-green-400">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                                    </svg>
                                    <span>Watched</span>
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Description area */}
                    <div className="flex-1 p-4 bg-gray-800 overflow-y-auto">                        
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
