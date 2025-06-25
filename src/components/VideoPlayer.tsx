import React, {useEffect, useRef} from 'react';
import {convertFileSrc} from '@tauri-apps/api/core';
import {ProcessedVideo} from '../services/videoProcessor';
import {formatDuration} from '../utils/videoUtils';

interface VideoPlayerProps {
    video: ProcessedVideo;
    isFullscreen: boolean;
    playbackSpeed: number;
    onClose: () => void;
    onSpeedChange: (speed: number) => void;
    onToggleFullscreen: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
                                                            video,
                                                            isFullscreen,
                                                            playbackSpeed,
                                                            onClose,
                                                            onSpeedChange,
                                                            onToggleFullscreen,
                                                        }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    // Atualizar velocidade quando mudada
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.playbackRate = playbackSpeed;
        }
    }, [playbackSpeed]);

    // Controles de teclado
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    if (videoRef.current) {
                        if (videoRef.current.paused) {
                            videoRef.current.play();
                        } else {
                            videoRef.current.pause();
                        }
                    }
                    break;
                case 'Escape':
                    if (isFullscreen) {
                        onToggleFullscreen();
                    } else {
                        onClose();
                    }
                    break;
                case 'KeyF':
                    e.preventDefault();
                    onToggleFullscreen();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (videoRef.current) {
                        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
                    }
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (videoRef.current) {
                        videoRef.current.currentTime = Math.min(
                            videoRef.current.duration,
                            videoRef.current.currentTime + 10
                        );
                    }
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyPress);
        return () => {
            document.removeEventListener('keydown', handleKeyPress);
        };
    }, [isFullscreen, onClose, onToggleFullscreen]);

    return (
        <div className={`fixed inset-0 bg-black z-50 flex flex-col ${isFullscreen ? 'z-[100]' : ''}`}>
            {/* Header do Player */}
            <div className="bg-gray-900 bg-opacity-90 p-4 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <button
                        onClick={onClose}
                        className="text-white hover:text-gray-300 transition-colors"
                        title="Close Player (Esc)"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                    <div>
                        <h3 className="text-white font-semibold text-lg">{video.title}</h3>
                        <p className="text-gray-300 text-sm">
                            {video.duration_seconds && formatDuration(video.duration_seconds)}
                        </p>
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    {/* Controle de Velocidade */}
                    <div className="flex items-center space-x-2">
                        <span className="text-white text-sm">Speed:</span>
                        <select
                            value={playbackSpeed}
                            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
                            className="bg-gray-700 text-white px-2 py-1 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value={0.5}>0.5x</option>
                            <option value={0.75}>0.75x</option>
                            <option value={1}>1x</option>
                            <option value={1.25}>1.25x</option>
                            <option value={1.5}>1.5x</option>
                            <option value={2}>2x</option>
                        </select>
                    </div>

                    {/* Botão Tela Cheia */}
                    <button
                        onClick={onToggleFullscreen}
                        className="text-white hover:text-gray-300 transition-colors"
                        title="Toggle Fullscreen (F)"
                    >
                        {isFullscreen ? (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M9 9V4.5M9 9H4.5M9 9L3.5 3.5M15 9h4.5M15 9V4.5M15 9l5.5-5.5M9 15v4.5M9 15H4.5M9 15l-5.5 5.5M15 15h4.5M15 15v4.5m0-4.5l5.5 5.5"/>
                            </svg>
                        ) : (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 1v4m0 0h-4m4 0l-5-5"/>
                            </svg>
                        )}
                    </button>
                </div>
            </div>

            {/* Player de Vídeo */}
            <div className="flex-1 flex items-center justify-center bg-black">
                <video
                    ref={videoRef}
                    src={convertFileSrc(video.file_path)}
                    controls
                    autoPlay
                    className="max-w-full max-h-full"
                    style={{
                        width: isFullscreen ? '100vw' : 'auto',
                        height: isFullscreen ? '100vh' : 'auto'
                    }}
                    onLoadedData={(e) => {
                        const videoElement = e.currentTarget;
                        videoElement.playbackRate = playbackSpeed;
                    }}
                >
                    Your browser does not support the video tag.
                </video>
            </div>

            {/* Controles e Informações */}
            <div className="bg-gray-900 bg-opacity-90 p-4">
                <div className="max-w-4xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
                        <div>
                            <p><span
                                className="font-medium">File:</span> {video.file_path.split(/[/\\]/).pop() || video.file_path}
                            </p>
                            <p><span
                                className="font-medium">Duration:</span> {video.duration_seconds ? formatDuration(video.duration_seconds) : 'Unknown'}
                            </p>
                        </div>
                        <div>
                            <p><span
                                className="font-medium">Description:</span> {video.description || 'No description available'}
                            </p>
                        </div>
                    </div>

                    {/* Dicas de Controle */}
                    <div className="mt-4 pt-4 border-t border-gray-700">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-400">
                            <div><kbd className="bg-gray-700 px-1 rounded">Space</kbd> Play/Pause</div>
                            <div><kbd className="bg-gray-700 px-1 rounded">←/→</kbd> Skip ±10s</div>
                            <div><kbd className="bg-gray-700 px-1 rounded">F</kbd> Fullscreen</div>
                            <div><kbd className="bg-gray-700 px-1 rounded">Esc</kbd> Close</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
