import React from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ProcessedVideo } from "../../types/video";
import { formatDuration } from "../../utils/videoUtils";

interface SearchResultsProps {
    isSearching: boolean;
    searchTerm: string;
    searchResults: ProcessedVideo[];
    searchProgress: {
        current: number;
        total: number;
        currentFile?: string;
    };
    onPlayVideo: (video: ProcessedVideo) => void;
    onContextMenu: (event: React.MouseEvent, video: ProcessedVideo) => void;
    onOpenVideoDetails: (video: ProcessedVideo) => void;
}

export default function SearchResults({
    isSearching,
    searchTerm,
    searchResults,
    searchProgress,
    onPlayVideo,
    onContextMenu,
    onOpenVideoDetails,
}: SearchResultsProps) {
    if (isSearching) {
        return (
            <div className="flex flex-col items-center justify-center h-32 space-y-4">
                <div className="flex items-center space-x-2">
                    <div className="animate-spin w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                    <span className="text-gray-400">Searching videos...</span>
                </div>
                {searchProgress.total > 0 && (
                    <div className="w-64 text-center">
                        <div className="text-xs text-gray-500 mb-1">
                            {searchProgress.current} / {searchProgress.total} files checked
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-1">
                            <div
                                className="bg-blue-500 h-1 rounded-full transition-all duration-300"
                                style={{
                                    width: `${(searchProgress.current / searchProgress.total) * 100}%`,
                                }}
                            ></div>
                        </div>
                        {searchProgress.currentFile && (
                            <div className="text-xs text-gray-600 mt-1 truncate">{searchProgress.currentFile}</div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div>
            <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-300 mb-2">Search Results</h3>
                <p className="text-sm text-gray-400">
                    {searchResults.length === 0
                        ? `No videos found for "${searchTerm}"`
                        : `Found ${searchResults.length} video${searchResults.length === 1 ? "" : "s"} for "${searchTerm}"`}
                </p>
            </div>

            {searchResults.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {searchResults.map((video, index) => (
                        <div
                            key={`search-${video.file_path}-${index}`}
                            className="bg-gray-800 rounded-lg overflow-hidden hover:bg-gray-750 transition-colors cursor-pointer"
                            onClick={() => onPlayVideo(video)}
                            onContextMenu={(e) => onContextMenu(e, video)}
                        >
                            <div className="aspect-video bg-gray-700 relative">
                                {video.thumbnail_path ? (
                                    <img
                                        src={convertFileSrc(video.thumbnail_path)}
                                        alt={video.title}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            e.currentTarget.style.display = "none";
                                        }}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <svg
                                            className="w-12 h-12 text-gray-500"
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
                                {video.is_watched && (
                                    <div className="absolute top-2 right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                        <svg
                                            className="w-4 h-4 text-white"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M5 13l4 4L19 7"
                                            />
                                        </svg>
                                    </div>
                                )}
                                {video.watch_progress_seconds != null &&
                                    video.watch_progress_seconds > 0 &&
                                    video.duration_seconds &&
                                    !video.is_watched && (
                                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-600">
                                            <div
                                                className="h-full bg-blue-500"
                                                style={{
                                                    width: `${(video.watch_progress_seconds / video.duration_seconds) * 100}%`,
                                                }}
                                            ></div>
                                        </div>
                                    )}
                            </div>
                            <div className="p-3">
                                <h4 className="font-medium text-gray-200 text-sm mb-1 line-clamp-2">{video.title}</h4>
                                <div className="flex items-center justify-between text-xs text-gray-400">
                                    <span>
                                        {video.duration_seconds ? formatDuration(video.duration_seconds) : "00:00"}
                                    </span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenVideoDetails(video);
                                        }}
                                        className="hover:text-gray-200 transition-colors"
                                        title="Video details"
                                    >
                                        ⓘ
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
