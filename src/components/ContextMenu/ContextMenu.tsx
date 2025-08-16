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

    const isMobile = window.innerWidth < 768;
    const menuWidth = isMobile ? 280 : 220;
    const menuHeight = isMobile ? 320 : 280;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let adjustedX = x;
    let adjustedY = y;
    
    if (isMobile) {
        adjustedX = Math.max(8, Math.min(viewportWidth - menuWidth - 8, x - menuWidth / 2));
        adjustedY = Math.max(8, Math.min(viewportHeight - menuHeight - 8, y - 50));
    } else {
        if (x + menuWidth > viewportWidth) {
            adjustedX = Math.max(0, viewportWidth - menuWidth - 8);
        }
        
        if (y + menuHeight > viewportHeight) {
            adjustedY = Math.max(0, viewportHeight - menuHeight - 8);
        }
    }

    const buttonClass = `w-full text-left ${isMobile ? 'px-6 py-4' : 'px-4 py-3'} text-sm text-gray-300 hover:bg-gray-700 active:bg-gray-600 transition-all duration-200 flex items-center gap-3 group ${isMobile ? 'touch-manipulation' : ''}`;
    const iconClass = "w-5 h-5 transition-colors";

    return (
        <div
            className={`fixed bg-gray-800 border border-gray-600 rounded-xl shadow-2xl z-50 py-2 backdrop-blur-sm ${isMobile ? 'ring-2 ring-gray-600' : ''}`}
            style={{
                left: `${adjustedX}px`,
                top: `${adjustedY}px`,
                minWidth: `${menuWidth}px`,
                maxWidth: isMobile ? '320px' : '280px'
            }}
        >
            <button
                onClick={() => { onPlayVideo(video); onClose(); }}
                className={buttonClass}
            >
                <svg className={`${iconClass} text-blue-400 group-hover:text-blue-300 group-active:text-blue-200`} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                </svg>
                <span className="font-medium">Play in Internal Player</span>
            </button>
            
            <button
                onClick={() => { onOpenFile(video.file_path); onClose(); }}
                className={buttonClass}
            >
                <svg className={`${iconClass} text-green-400 group-hover:text-green-300 group-active:text-green-200`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                </svg>
                <span className="font-medium">Open External</span>
            </button>
            
            <button
                onClick={() => { onOpenWith(video.file_path); onClose(); }}
                className={buttonClass}
            >
                <svg className={`${iconClass} text-yellow-400 group-hover:text-yellow-300 group-active:text-yellow-200`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z"/>
                </svg>
                <span className="font-medium">Show in Explorer</span>
            </button>
            
            <div className="border-t border-gray-600 my-2"></div>
            
            <button
                onClick={handleToggleWatchedStatus}
                className={buttonClass}
            >
                {video.is_watched ? (
                    <svg className={`${iconClass} text-orange-400 group-hover:text-orange-300 group-active:text-orange-200`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                ) : (
                    <svg className={`${iconClass} text-green-400 group-hover:text-green-300 group-active:text-green-200`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                    </svg>
                )}
                <span className="font-medium">
                    {video.is_watched ? 'Mark as Unwatched' : 'Mark as Watched'}
                </span>
            </button>
            
            <button
                onClick={() => { onOpenProperties(video); onClose(); }}
                className={`${buttonClass} rounded-b-xl`}
            >
                <svg className={`${iconClass} text-purple-400 group-hover:text-purple-300 group-active:text-purple-200`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                <span className="font-medium">Properties</span>
            </button>
        </div>
    );
};

export default ContextMenu;
