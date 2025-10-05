import React, { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { ProcessedVideo, FolderStats } from "../../types/video";
import { formatDuration } from "../../utils/videoUtils";
import { DirEntry } from "../../contexts/NavigationContext";
import { useFolderStats } from "../../hooks/useFolderStats";
import { getFolderStats } from "../../database";
import ConfirmOpenFileModal from "../Modals/ConfirmOpenFileModal";

interface DirectoryViewProps {
    loading: boolean;
    currentPath: string;
    processedVideos: ProcessedVideo[];
    directoryContents: DirEntry[];
    libraryFolders: string[];
    videoProcessingState: {
        processingVideos: boolean;
    };
    onPlayVideo: (video: ProcessedVideo) => void;
    onContextMenu: (event: React.MouseEvent, video: ProcessedVideo) => void;
    onNavigateToDirectory: (path: string) => void;
    onFolderContextMenu?: (event: React.MouseEvent, folderPath: string, folderName: string) => void;
    naturalSort: (a: string, b: string) => number;
}

export default function DirectoryView({
    loading,
    currentPath,
    processedVideos,
    directoryContents,
    libraryFolders,
    videoProcessingState,
    onPlayVideo,
    onContextMenu,
    onNavigateToDirectory,
    onFolderContextMenu,
    naturalSort,
}: DirectoryViewProps) {
    const { stats } = useFolderStats(currentPath);
    const [folderStats, setFolderStats] = useState<Map<string, FolderStats>>(new Map());
    const [showOpenFileModal, setShowOpenFileModal] = useState(false);
    const [selectedFile, setSelectedFile] = useState<{ path: string; name: string } | null>(null);

    const handleNonVideoFileClick = async (filePath: string, fileName: string) => {
        setSelectedFile({ path: filePath, name: fileName });
        setShowOpenFileModal(true);
    };

    const handleConfirmOpenFile = async () => {
        if (!selectedFile) return;

        try {
            await openPath(selectedFile.path);
        } catch (error) {
            console.error("Error opening file:", error);
            alert(`Failed to open file: ${error}`);
        } finally {
            setShowOpenFileModal(false);
            setSelectedFile(null);
        }
    };

    const handleCancelOpenFile = () => {
        setShowOpenFileModal(false);
        setSelectedFile(null);
    };

    const normalizePath = (p: string) =>
        p
            .replace(/\\/g, "/")
            .replace(/[\/]+$/, "")
            .toLowerCase();
    const isTopLevelFolder = libraryFolders.some((f) => normalizePath(f) === normalizePath(currentPath));

    React.useEffect(() => {
        const loadFolderStats = async () => {
            const statsMap = new Map<string, FolderStats>();
            const folders = directoryContents.filter((item) => item.is_dir);

            for (const folder of folders) {
                try {
                    const stats = await getFolderStats(folder.path);
                    statsMap.set(folder.path, stats);
                } catch (error) {
                    console.error(`Error loading stats for ${folder.path}:`, error);
                }
            }

            setFolderStats(statsMap);
        };

        if (directoryContents.length > 0) {
            loadFolderStats();
        }
    }, [directoryContents]);

    const sortedVideos = React.useMemo(
        () => [...processedVideos].sort((a, b) => naturalSort(a.title || a.file_path, b.title || b.file_path)),
        [processedVideos, naturalSort]
    );
    const videosToShow = isTopLevelFolder ? sortedVideos.slice(0, 5) : sortedVideos;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-32">
                <div className="text-gray-400">Loading...</div>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-300">
                            {currentPath.split(/[/\\]/).pop() || currentPath}
                        </h3>
                        {stats.isFullyWatched && stats.totalVideos > 0 && (
                            <div
                                className="flex items-center gap-1.5 text-green-500"
                                title="All videos watched"
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path
                                        fillRule="evenodd"
                                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            </div>
                        )}
                    </div>
                    <p className="text-sm text-gray-400">{currentPath}</p>
                </div>
                {videoProcessingState.processingVideos && (
                    <div className="flex items-center space-x-2 text-sm text-blue-400">
                        <div className="animate-spin w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                        <span>Processing videos...</span>
                    </div>
                )}
            </div>

            <div className="mb-6">
                {(directoryContents.some((item) => item.is_dir) ||
                    directoryContents.some((item) => !item.is_video)) && (
                    <h4 className="text-md font-medium text-gray-300 mb-3">
                        {processedVideos.length > 0 ? "Folders & Other Files" : "Contents"}
                    </h4>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {directoryContents
                        .filter((item) => item.is_dir || !item.is_video)
                        .sort((a, b) => naturalSort(a.name, b.name))
                        .map((item, index) => {
                            const itemStats = item.is_dir ? folderStats.get(item.path) : null;
                            const isFullyWatched = itemStats?.isFullyWatched || false;

                            return (
                                <div
                                    key={index}
                                    onClick={() => {
                                        if (item.is_dir) {
                                            onNavigateToDirectory(item.path);
                                        } else if (!item.is_video) {
                                            handleNonVideoFileClick(item.path, item.name);
                                        }
                                    }}
                                    onContextMenu={(e) => {
                                        if (item.is_dir && onFolderContextMenu) {
                                            e.preventDefault();
                                            onFolderContextMenu(e, item.path, item.name);
                                        }
                                    }}
                                    className={`p-4 rounded-lg border transition-all relative ${
                                        item.is_dir
                                            ? isFullyWatched
                                                ? "cursor-pointer border-green-500 hover:bg-green-900 hover:bg-opacity-10"
                                                : "cursor-pointer hover:bg-gray-800 hover:border-gray-600 border-gray-700"
                                            : item.is_video
                                              ? "cursor-default border-gray-700"
                                              : "cursor-pointer hover:bg-gray-800 hover:border-gray-600 border-gray-700"
                                    }`}
                                >
                                    <div className="flex items-center space-x-3">
                                        <div className="flex-shrink-0 relative">
                                            {item.is_dir ? (
                                                <>
                                                    <svg
                                                        className={`w-8 h-8 ${isFullyWatched ? "text-green-400" : "text-blue-400"}`}
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                        strokeWidth={isFullyWatched ? 2.5 : 2}
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z"
                                                        />
                                                    </svg>
                                                    {isFullyWatched && (
                                                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center border-2 border-gray-800">
                                                            <svg
                                                                className="w-2.5 h-2.5 text-white"
                                                                fill="currentColor"
                                                                viewBox="0 0 20 20"
                                                            >
                                                                <path
                                                                    fillRule="evenodd"
                                                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                                    clipRule="evenodd"
                                                                />
                                                            </svg>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <svg
                                                    className="w-8 h-8 text-gray-400"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                                    />
                                                </svg>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-300 truncate">{item.name}</p>
                                            <p className="text-xs text-gray-500">{item.is_dir ? "Folder" : "File"}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                </div>
            </div>

            {processedVideos.length > 0 && (
                <div className="mb-6">
                    <h4 className="text-md font-medium text-gray-300 mb-3">Videos</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                        {videosToShow.map((video, index) => (
                            <div
                                key={`${video.file_path}-${index}`}
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
                                                const parent = e.currentTarget.parentElement;
                                                if (parent) {
                                                    e.currentTarget.style.display = "none";
                                                    const fallbackIcon = parent.querySelector(".fallback-icon");
                                                    if (fallbackIcon) {
                                                        (fallbackIcon as HTMLElement).style.display = "flex";
                                                    }
                                                }
                                            }}
                                        />
                                    ) : null}

                                    <div
                                        className={`fallback-icon absolute inset-0 flex items-center justify-center ${
                                            video.thumbnail_path ? "hidden" : "flex"
                                        }`}
                                    >
                                        <svg
                                            className="w-8 h-8 text-gray-400"
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

                                    {video.duration_seconds && video.duration_seconds > 0 && (
                                        <div className="absolute bottom-1 right-1 bg-black bg-opacity-75 text-white text-xs px-1 py-0.5 rounded">
                                            {formatDuration(video.duration_seconds)}
                                        </div>
                                    )}
                                </div>
                                <div className="p-2">
                                    <p className="text-sm font-medium text-gray-300 truncate" title={video.title}>
                                        {video.title}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                    {isTopLevelFolder && processedVideos.length > 5 && (
                        <p className="text-sm text-gray-400 mt-2">Showing 5 of {processedVideos.length} videos</p>
                    )}
                </div>
            )}

            {processedVideos.length === 0 && directoryContents.length === 0 && (
                <div className="text-center py-8">
                    <div className="text-gray-400">This folder is empty</div>
                </div>
            )}

            <ConfirmOpenFileModal
                show={showOpenFileModal}
                fileName={selectedFile?.name || ""}
                filePath={selectedFile?.path || ""}
                onConfirm={handleConfirmOpenFile}
                onCancel={handleCancelOpenFile}
            />
        </div>
    );
}
