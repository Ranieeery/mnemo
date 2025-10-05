import React, { useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ProcessedVideo } from "../../types/video";

interface NextVideoModalProps {
    show: boolean;
    nextVideo: ProcessedVideo | null;
    countdown: number;
    savedSettings: {
        speed: number;
        volume: number;
        subtitlesEnabled: boolean;
    };
    onPlayNext: () => void;
    onCancel: () => void;
}

const NextVideoModal: React.FC<NextVideoModalProps> = ({
    show,
    nextVideo,
    countdown,
    savedSettings,
    onPlayNext,
    onCancel,
}) => {
    useEffect(() => {
        if (!show) return;

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onCancel();
            }
        };

        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [show, onCancel]);

    if (!show || !nextVideo) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
            <div className="absolute inset-0 backdrop-blur-md bg-black/30 transition-opacity" />
            <div className="relative bg-gray-900/90 rounded-lg p-6 w-96 border border-gray-700 backdrop-blur-xl">
                <h3 className="text-lg font-semibold text-gray-200 mb-4 flex items-center justify-between">
                    <div className="flex items-center">
                        <svg
                            className="w-5 h-5 mr-2 text-blue-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                        </svg>
                        Play Next Video?
                    </div>
                    <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white">
                            {countdown}
                        </div>
                    </div>
                </h3>

                <div className="mb-4">
                    <div className="flex items-start space-x-3">
                        {nextVideo.thumbnail_path && (
                            <img
                                src={convertFileSrc(nextVideo.thumbnail_path)}
                                alt={nextVideo.title}
                                className="w-16 h-12 object-cover rounded bg-gray-700 flex-shrink-0"
                            />
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-200 truncate">{nextVideo.title}</p>
                            <p className="text-xs text-gray-400 mt-1">Duration: {nextVideo.duration || "00:00"}</p>
                            <p className="text-xs text-gray-500 mt-1">Playing automatically in {countdown} seconds</p>
                            <p className="text-xs text-gray-500 mt-1">
                                Settings preserved: {savedSettings.speed}x speed,{" "}
                                {Math.round(savedSettings.volume * 100)}% volume, subtitles{" "}
                                {savedSettings.subtitlesEnabled ? "on" : "off"}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end space-x-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onPlayNext}
                        className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                    >
                        Play Now
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NextVideoModal;
