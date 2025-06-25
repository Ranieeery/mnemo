import React from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ProcessedVideo } from '../../services/videoProcessor';
import { formatDuration } from '../../utils/videoUtils';

interface HomePageProps {
    libraryFolders: string[];
    videosInProgress: ProcessedVideo[];
    recentVideos: ProcessedVideo[];
    suggestedVideos: ProcessedVideo[];
    libraryFoldersWithPreviews: {
        folder: string;
        videos: ProcessedVideo[];
    }[];
    onAddFolder: () => void;
    onPlayVideo: (video: ProcessedVideo) => void;
    onSelectFolder: (folder: string) => void;
    onContextMenu: (event: React.MouseEvent, video: ProcessedVideo) => void;
}

const HomePage: React.FC<HomePageProps> = ({
    libraryFolders,
    videosInProgress,
    recentVideos,
    suggestedVideos,
    libraryFoldersWithPreviews,
    onAddFolder,
    onPlayVideo,
    onSelectFolder,
    onContextMenu
}) => {
    const renderVideoCard = (video: ProcessedVideo, index: number, keyPrefix: string = '') => (
        <div
            key={`${keyPrefix}${video.file_path}-${index}`}
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
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                        }}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor"
                             viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                        </svg>
                    </div>
                )}
                
                {video.is_watched && (
                    <div className="absolute top-2 right-2 bg-green-600 rounded-full p-1">
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"/>
                        </svg>
                    </div>
                )}
                
                {video.watch_progress_seconds != null && video.watch_progress_seconds > 0 && video.duration_seconds && !video.is_watched && (
                    <div className="absolute bottom-0 left-0 right-0 bg-blue-600 h-1">
                        <div
                            className="bg-blue-400 h-full"
                            style={{
                                width: `${(video.watch_progress_seconds / video.duration_seconds) * 100}%`
                            }}
                        ></div>
                    </div>
                )}
            </div>
            <div className="p-2">
                <h4 className="font-medium text-gray-200 text-sm mb-1 line-clamp-2">
                    {video.title}
                </h4>
                <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>
                        {video.duration_seconds ? formatDuration(video.duration_seconds) : '00:00'}
                    </span>
                </div>
            </div>
        </div>
    );

    return (
        <div>
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-200 mb-2">Welcome to Mnemo</h2>
                <p className="text-gray-400">Your personal video library</p>
            </div>

            {libraryFolders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor"
                             viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                        </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-300 mb-2">Get Started</h3>
                    <p className="text-gray-400 mb-6 max-w-md">
                        Add folders containing your videos to start building your library.
                        Mnemo will scan and organize your videos while preserving your folder structure.
                    </p>
                    <button
                        onClick={onAddFolder}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                    >
                        Add Your First Folder
                    </button>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Continue Watching */}
                    {videosInProgress.length > 0 && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-300 mb-4">Continue Watching</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                                {videosInProgress.map((video, index) => 
                                    renderVideoCard(video, index, 'progress-')
                                )}
                            </div>
                        </div>
                    )}

                    {/* Recently Watched */}
                    {recentVideos.length > 0 && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-300 mb-4">Recently Watched</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                                {recentVideos.map((video, index) => 
                                    renderVideoCard(video, index, 'recent-')
                                )}
                            </div>
                        </div>
                    )}

                    {/* Suggested Videos */}
                    {suggestedVideos.length > 0 && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-300 mb-4">Suggestions for You</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                                {suggestedVideos.map((video, index) => 
                                    renderVideoCard(video, index, 'suggested-')
                                )}
                            </div>
                        </div>
                    )}

                    {/* Library Folders Preview */}
                    {libraryFoldersWithPreviews.length > 0 && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-300 mb-4">Your Library</h3>
                            <div className="space-y-6">
                                {libraryFoldersWithPreviews.map((folderData, folderIndex) => (
                                    <div key={folderIndex}>
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-md font-medium text-gray-300">
                                                {folderData.folder.split(/[/\\]/).pop() || folderData.folder}
                                            </h4>
                                            <button
                                                onClick={() => onSelectFolder(folderData.folder)}
                                                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                                            >
                                                View All →
                                            </button>
                                        </div>
                                        {folderData.videos.length > 0 ? (
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                                                {folderData.videos.slice(0, 6).map((video, videoIndex) => 
                                                    renderVideoCard(video, videoIndex, `folder-${folderIndex}-`)
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-gray-500 text-sm">No videos found in this folder</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default HomePage;
