import React, { useEffect } from "react";

interface ConfirmOpenFileModalProps {
    show: boolean;
    fileName: string;
    filePath: string;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmOpenFileModal: React.FC<ConfirmOpenFileModalProps> = ({ show, filePath, onConfirm, onCancel }) => {
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
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
            <div className="absolute inset-0 backdrop-blur-md bg-black/30 transition-opacity" onClick={onCancel}></div>

            <div
                className="relative bg-gray-900/90 rounded-lg shadow-lg max-w-md w-full mx-4 p-6 backdrop-blur-xl border border-gray-700"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                />
                            </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-200">Open File</h3>
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
                        This file will be opened with your system's default application.
                    </p>
                    
                    <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                        <p className="text-xs text-gray-400 break-all">{filePath}</p>
                    </div>
                </div>

                <div className="flex justify-end space-x-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-sm shadow"
                    >
                        Open File
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmOpenFileModal;
