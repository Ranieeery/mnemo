import React, { useEffect } from "react";

interface ConfirmRemoveAllTagsModalProps {
    show: boolean;
    folderName: string;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmRemoveAllTagsModal: React.FC<ConfirmRemoveAllTagsModalProps> = ({
    show,
    folderName,
    onConfirm,
    onCancel,
}) => {
    useEffect(() => {
        if (!show) return;

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onCancel();
            }
        };

        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [show, onCancel]);

    if (!show) return null;

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 px-4 py-8">
            <div className="absolute inset-0 backdrop-blur-md bg-black/30 transition-opacity" onClick={onCancel}></div>

            <div
                className="relative bg-gray-900/90 rounded-lg shadow-lg max-w-md w-full mx-4 p-6 backdrop-blur-xl border border-gray-700"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-200">Remove All Tags</h3>
                    </div>
                    <button onClick={onCancel} className="text-gray-400 hover:text-gray-200">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>

                <div className="mb-6">
                    <p className="text-gray-300 mb-3">
                        Are you sure you want to remove <strong>ALL tags</strong> from all videos in this folder?
                    </p>
                    <div className="bg-gray-700 rounded-lg p-3 mb-4">
                        <p className="text-sm font-medium text-gray-200">{folderName}</p>
                    </div>
                    <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-3">
                        <div className="flex items-start space-x-2">
                            <svg
                                className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L2.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                                />
                            </svg>
                            <div className="text-sm text-red-200">
                                <strong>Warning:</strong> This action cannot be undone. All tags will be permanently
                                removed from every video in this folder.
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end space-x-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                        Remove All Tags
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmRemoveAllTagsModal;
