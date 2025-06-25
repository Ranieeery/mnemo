import React from 'react';

interface ConfirmRemovalModalProps {
    show: boolean;
    folderToRemove: string | null;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmRemovalModal: React.FC<ConfirmRemovalModalProps> = ({
    show,
    folderToRemove,
    onConfirm,
    onCancel
}) => {
    if (!show || !folderToRemove) return null;

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black bg-opacity-50"
                onClick={onCancel}
            ></div>

            {/* Modal Content */}
            <div className="relative bg-gray-800 rounded-lg shadow-lg max-w-md w-full mx-4 p-6"
                 onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor"
                                 viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-200">
                            Remove Folder
                        </h3>
                    </div>
                    <button
                        onClick={onCancel}
                        className="text-gray-400 hover:text-gray-200"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="mb-6">
                    <p className="text-gray-300 mb-2">
                        Are you sure you want to remove this folder from your library?
                    </p>
                    <div className="bg-gray-700 rounded-lg p-3 mb-4">
                        <p className="text-sm font-medium text-gray-200 mb-1">
                            {folderToRemove.split(/[/\\]/).pop() || folderToRemove}
                        </p>
                        <p className="text-xs text-gray-400 break-all">
                            {folderToRemove}
                        </p>
                    </div>
                    <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-3 mb-3">
                        <div className="flex items-start space-x-2">
                            <svg className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" fill="none"
                                 stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L2.732 16.5c-.77.833.192 2.5 1.732 2.5z"/>
                            </svg>
                            <div className="text-sm">
                                <p className="text-yellow-200 font-medium mb-1">Important:</p>
                                <p className="text-yellow-300">
                                    Your video files will remain untouched on your computer.
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-3">
                        <div className="flex items-start space-x-2">
                            <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none"
                                 stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                            <div className="text-sm">
                                <p className="text-red-200 font-medium mb-1">This action will:</p>
                                <ul className="text-red-300 space-y-1">
                                    <li>• Remove all indexed videos from this folder</li>
                                    <li>• Delete watch progress and tags for these videos</li>
                                    <li>• Remove videos from home page and statistics</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end space-x-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                    >
                        Remove Folder
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmRemovalModal;
