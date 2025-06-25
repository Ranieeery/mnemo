import React from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ProcessedVideo } from '../../services/videoProcessor';
import { formatDuration } from '../../utils/videoUtils';
import { VideoTagsManager } from '../VideoTagsManager';

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
    onDescriptionChange
}) => {
    if (!show || !video) {
        return null;
    }

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black bg-opacity-50"
                onClick={onClose}
            ></div>

            {/* Modal Content */}
            <div className="relative bg-gray-800 rounded-lg shadow-lg max-w-lg w-full mx-4 p-6"
                 onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-300">
                        Video Details
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-200"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>

                {/* Video Thumbnail */}
                <div className="mb-4">
                    {video.thumbnail_path ? (
                        <img
                            src={convertFileSrc(video.thumbnail_path)}
                            alt={video.title}
                            className="w-full h-auto rounded-lg"
                        />
                    ) : (
                        <div className="w-full h-40 bg-gray-700 rounded-lg flex items-center justify-center">
                            <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor"
                                 viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                            </svg>
                        </div>
                    )}
                </div>

                {/* Title and Description */}
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                        Title
                    </label>
                    <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => onTitleChange(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                        Description
                    </label>
                    <textarea
                        value={editingDescription}
                        onChange={(e) => onDescriptionChange(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={3}
                        placeholder="Add a description..."
                    />
                </div>

                {/* Video Metadata */}
                <div className="mb-4 p-3 bg-gray-700 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-300 mb-2">Video Information</h4>
                    <div className="space-y-1 text-sm text-gray-400">
                        {video.duration_seconds && video.duration_seconds > 0 && (
                            <div>
                                <span className="font-medium">Duration:</span> {formatDuration(video.duration_seconds)}
                            </div>
                        )}
                        <div>
                            <span className="font-medium">File Path:</span>
                            <div className="break-all mt-1 text-xs">{video.file_path}</div>
                        </div>
                    </div>
                </div>

                {/* Tags Section */}
                <VideoTagsManager video={video}/>

                {/* Actions */}
                <div className="flex justify-end space-x-2">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                    >
                        Reset
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onSave}
                        className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                    >
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VideoDetailsModal;
