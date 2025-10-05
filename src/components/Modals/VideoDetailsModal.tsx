import React, { useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ProcessedVideo } from "../../types/video";
import { formatDuration } from "../../utils/videoUtils";
import { VideoTagsManager } from "../VideoTagsManager";

interface VideoDetailsModalProps {
    show: boolean;
    video: ProcessedVideo | null;
    editingTitle: string;
    editingDescription: string;
    onClose: () => void;
    onSave: () => void;
    onCancel: () => void;
    onTitleChange: (title: string) => void;
    onDescriptionChange: (description: string) => void;
}

const VideoDetailsModal: React.FC<VideoDetailsModalProps> = ({
    show,
    video,
    editingTitle,
    editingDescription,
    onClose,
    onSave,
    onCancel,
    onTitleChange,
    onDescriptionChange,
}) => {
    useEffect(() => {
        if (show) {
            const original = document.body.style.overflow;
            document.body.style.overflow = "hidden";
            return () => {
                document.body.style.overflow = original;
            };
        }
    }, [show]);

    useEffect(() => {
        if (!show) return;

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };

        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [show, onClose]);

    if (!show || !video) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-8">
            <div
                className="absolute inset-0 backdrop-blur-md bg-black/30 transition-opacity animate-fade-in"
                onClick={onClose}
            />

            <div
                className="relative max-h-full overflow-y-auto w-full max-w-2xl bg-gray-900/90 border border-gray-700 shadow-2xl rounded-2xl p-6 backdrop-blur-xl animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                    <h3 className="text-xl font-semibold text-gray-100 tracking-tight">Video Details</h3>
                    <button
                        onClick={onClose}
                        className="self-start sm:self-auto text-gray-400 hover:text-gray-200 transition-colors"
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

                <div className="mb-6 grid gap-4 sm:grid-cols-2">
                    {video.thumbnail_path ? (
                        <div className="relative group">
                            <img
                                src={convertFileSrc(video.thumbnail_path)}
                                alt={video.title}
                                className="w-full h-full object-cover rounded-lg border border-gray-700 shadow"
                            />
                            {video.is_watched && (
                                <span className="absolute top-2 right-2 px-2 py-1 text-xs font-medium rounded bg-green-600/80 text-white backdrop-blur">
                                    Watched
                                </span>
                            )}
                        </div>
                    ) : (
                        <div className="w-full h-40 bg-gray-800 rounded-lg flex items-center justify-center border border-gray-700">
                            <svg
                                className="w-16 h-16 text-gray-400"
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
                        </div>
                    )}
                    <div className="flex flex-col gap-3 text-sm text-gray-300">
                        {video.duration_seconds && video.duration_seconds > 0 && (
                            <div className="flex items-center justify-between">
                                <span className="uppercase tracking-wide text-xs text-gray-400">Duration</span>
                                <span className="font-medium text-gray-200">
                                    {formatDuration(video.duration_seconds)}
                                </span>
                            </div>
                        )}
                        {video.watch_progress_seconds != null && video.duration_seconds != null && (
                            <div className="flex items-center justify-between">
                                <span className="uppercase tracking-wide text-xs text-gray-400">Progress</span>
                                <span className="font-medium text-gray-200">
                                    {Math.round((video.watch_progress_seconds / video.duration_seconds) * 100)}%
                                </span>
                            </div>
                        )}
                        <div className="flex flex-col gap-1">
                            <span className="uppercase tracking-wide text-xs text-gray-400">Path</span>
                            <span className="text-xs break-all text-gray-400 font-mono bg-gray-800/60 rounded p-2 border border-gray-700/60">
                                {video.file_path}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-300 mb-1">Title</label>
                    <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => onTitleChange(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800/70 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                </div>

                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                    <textarea
                        value={editingDescription}
                        onChange={(e) => onDescriptionChange(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800/70 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                        rows={3}
                        placeholder="Add a description..."
                    />
                </div>

                <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-200 mb-2">Tags</h4>
                    <VideoTagsManager video={video} />
                </div>

                <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                    >
                        Reset
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm bg-gray-800/70 hover:bg-gray-700 text-gray-200 rounded-md transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onSave}
                        className="px-4 py-2 text-sm bg-blue-600/90 hover:bg-blue-700 text-white rounded-md transition-colors shadow"
                    >
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VideoDetailsModal;
