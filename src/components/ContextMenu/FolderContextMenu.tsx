import React from "react";

interface FolderContextMenuProps {
    show: boolean;
    x: number;
    y: number;
    folderName: string;
    hasWatchedVideos?: boolean;
    hasUnwatchedVideos?: boolean;
    onMarkAllAsWatched: () => void;
    onMarkAllAsUnwatched?: () => void;
    onClose: () => void;
}

const FolderContextMenu: React.FC<FolderContextMenuProps> = ({
    show,
    x,
    y,
    folderName,
    hasWatchedVideos = false,
    hasUnwatchedVideos = true,
    onMarkAllAsWatched,
    onMarkAllAsUnwatched,
    onClose,
}) => {
    if (!show) {
        return null;
    }

    const isMobile = window.innerWidth < 768;
    const menuWidth = isMobile ? 280 : 220;
    const menuHeight = isMobile ? 100 : 80;
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

    const buttonClass = `w-full text-left ${isMobile ? "px-6 py-4" : "px-4 py-3"} text-sm text-gray-300 hover:bg-gray-700 active:bg-gray-600 transition-all duration-200 flex items-center gap-3 group ${isMobile ? "touch-manipulation" : ""}`;
    const iconClass = "w-5 h-5 transition-colors";

    return (
        <div
            className={`fixed bg-gray-800 border border-gray-600 rounded-xl shadow-2xl z-50 py-2 backdrop-blur-sm ${isMobile ? "ring-2 ring-gray-600" : ""}`}
            style={{
                left: `${adjustedX}px`,
                top: `${adjustedY}px`,
                minWidth: `${menuWidth}px`,
                maxWidth: isMobile ? "320px" : "280px",
            }}
        >
            <div className="px-4 py-2 border-b border-gray-700">
                <p className="text-xs text-gray-400 truncate" title={folderName}>
                    {folderName}
                </p>
            </div>

            {hasUnwatchedVideos && (
                <button
                    onClick={() => {
                        onMarkAllAsWatched();
                        onClose();
                    }}
                    className={`${buttonClass} ${!hasWatchedVideos ? "rounded-b-xl" : ""}`}
                >
                    <svg
                        className={`${iconClass} text-blue-400 group-hover:text-blue-300 group-active:text-blue-200`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    <span className="font-medium">Mark All as Watched</span>
                </button>
            )}

            {hasWatchedVideos && onMarkAllAsUnwatched && (
                <button
                    onClick={() => {
                        onMarkAllAsUnwatched();
                        onClose();
                    }}
                    className={`${buttonClass} rounded-b-xl`}
                >
                    <svg
                        className={`${iconClass} text-orange-400 group-hover:text-orange-300 group-active:text-orange-200`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                        />
                    </svg>
                    <span className="font-medium">Mark All as Unwatched</span>
                </button>
            )}
        </div>
    );
};

export default FolderContextMenu;
