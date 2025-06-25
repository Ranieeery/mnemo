import React from 'react';

interface ProcessingProgressBarProps {
    show: boolean;
    progress: {
        total: number;
        processed: number;
        currentFile: string;
    };
    currentIndexingFolder: string | null;
}

const ProcessingProgressBar: React.FC<ProcessingProgressBarProps> = ({
    show,
    progress,
    currentIndexingFolder
}) => {
    if (!show) return null;

    return (
        <div className="bg-gray-800 border-b border-gray-700 px-4 py-2">
            <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
                <span>
                    {currentIndexingFolder ? `Indexing folder: ${currentIndexingFolder.split(/[/\\]/).pop()}` : 'Processing videos...'}
                </span>
                <span>{progress.processed} / {progress.total}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{
                        width: progress.total > 0
                            ? `${(progress.processed / progress.total) * 100}%`
                            : '0%'
                    }}
                ></div>
            </div>
            {progress.currentFile && (
                <div className="text-xs text-gray-500 mt-1 truncate">
                    Processing: {progress.currentFile}
                </div>
            )}
        </div>
    );
};

export default ProcessingProgressBar;
