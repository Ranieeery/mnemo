import React from "react";

interface SearchProgressBarProps {
    show: boolean;
    progress: {
        current: number;
        total: number;
        currentFile: string;
    };
}

const SearchProgressBar: React.FC<SearchProgressBarProps> = ({ show, progress }) => {
    if (!show || progress.total === 0) return null;

    return (
        <div className="bg-gray-800 border-b border-gray-700 px-4 py-2">
            <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
                <span>Searching videos...</span>
                <span>
                    {progress.current} / {progress.total}
                </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                    style={{
                        width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : "0%",
                    }}
                ></div>
            </div>
            {progress.currentFile && (
                <div className="text-xs text-gray-500 mt-1 truncate">Checking: {progress.currentFile}</div>
            )}
        </div>
    );
};

export default SearchProgressBar;
