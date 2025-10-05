import React from "react";

interface LibraryFolderContextMenuProps {
    show: boolean;
    x: number;
    y: number;
    folderName: string;
    onSyncFolder: () => void;
    onChangeIcon: () => void;
    onClose: () => void;
}

const LibraryFolderContextMenu: React.FC<LibraryFolderContextMenuProps> = ({
    show,
    x,
    y,
    folderName,
    onSyncFolder,
    onChangeIcon,
    onClose,
}) => {
    if (!show) {
        return null;
    }

    const isMobile = window.innerWidth < 768;
    const menuWidth = isMobile ? 280 : 220;
    const menuHeight = isMobile ? 160 : 140;
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
                <p className="text-2xs text-gray-400 truncate" title={folderName}>
                    {folderName}
                </p>
            </div>

            <button
                onClick={() => {
                    onSyncFolder();
                    onClose();
                }}
                className={buttonClass}
            >
                <svg
                    className={`${iconClass} text-purple-400 group-hover:text-purple-300 group-active:text-purple-200`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                </svg>
                <span className="font-medium">Sync Folder</span>
            </button>

            <button
                onClick={() => {
                    onChangeIcon();
                    onClose();
                }}
                className={`${buttonClass} rounded-b-xl`}
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
                        d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                    />
                </svg>
                <span className="font-medium">Change Icon</span>
            </button>
        </div>
    );
};

export default LibraryFolderContextMenu;
