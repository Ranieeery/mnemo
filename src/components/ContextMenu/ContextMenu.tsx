import React from 'react';
import { ProcessedVideo } from '../../types/video';

interface ContextMenuProps {
    show: boolean;
    x: number;
    y: number;
    video: ProcessedVideo | null;
    onPlayVideo: (video: ProcessedVideo) => void;
    onOpenFile: (filePath: string) => void;
    onOpenWith: (filePath: string) => void;
    onToggleWatchedStatus: (video: ProcessedVideo) => void;
    onOpenProperties: (video: ProcessedVideo) => void;
    onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
    show,
    x,
    y,
    video,
    onPlayVideo,
    onOpenFile,
    onOpenWith,
    onToggleWatchedStatus,
    onOpenProperties,
    onClose
}) => {
    if (!show || !video) {
        return null;
    }

    const handleToggleWatchedStatus = () => {
        onToggleWatchedStatus(video);
        onClose();
    };

    return (
        <div
            className="fixed bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-50 py-1"
            style={{
                left: `${x}px`,
                top: `${y}px`,
                minWidth: '150px'
            }}
        >
            <button
                onClick={() => onPlayVideo(video)}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            >
                ▶️ Play in Internal Player
            </button>
            <button
                onClick={() => onOpenFile(video.file_path)}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            >
                🎬 Open External
            </button>
            <button
                onClick={() => onOpenWith(video.file_path)}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            >
                📁 Show in Explorer
            </button>
            <hr className="border-gray-600 my-1"/>
            <button
                onClick={handleToggleWatchedStatus}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            >
                {video.is_watched ? '❌ Mark as Unwatched' : '✅ Mark as Watched'}
            </button>
            <button
                onClick={() => onOpenProperties(video)}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            >
                ⚙️ Properties
            </button>
        </div>
    );
};

export default ContextMenu;
