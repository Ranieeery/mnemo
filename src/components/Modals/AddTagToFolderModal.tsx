import React, { useEffect, useState } from "react";
import { getAllTags } from "../../database";

interface Tag {
    id: number;
    name: string;
}

interface AddTagToFolderModalProps {
    show: boolean;
    folderName: string;
    onConfirm: (tagName: string) => void;
    onCancel: () => void;
}

const AddTagToFolderModal: React.FC<AddTagToFolderModalProps> = ({ show, folderName, onConfirm, onCancel }) => {
    const [tagName, setTagName] = useState("");
    const [existingTags, setExistingTags] = useState<Tag[]>([]);

    useEffect(() => {
        if (show) {
            setTagName("");
            loadExistingTags();
        }
    }, [show]);

    const loadExistingTags = async () => {
        try {
            const tags = await getAllTags();
            setExistingTags(tags);
        } catch (error) {
            console.error("Error loading tags:", error);
            setExistingTags([]);
        }
    };

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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (tagName.trim()) {
            onConfirm(tagName.trim());
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
            <div className="absolute inset-0 backdrop-blur-md bg-black/30 transition-opacity" onClick={onCancel}></div>

            <div
                className="relative bg-gray-900/90 rounded-lg shadow-lg max-w-md w-full mx-4 p-6 backdrop-blur-xl border border-gray-700"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                            <svg
                                className="w-6 h-6 text-green-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                                />
                            </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-200">Add Tag to Folder</h3>
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

                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 mb-3">
                            <p className="text-sm text-gray-400">Folder:</p>
                            <p className="text-sm text-gray-200 font-medium truncate">{folderName}</p>
                        </div>

                        <p className="text-sm text-gray-400 mb-3">
                            This tag will be added to <span className="font-semibold text-gray-200">all videos</span>{" "}
                            inside this folder.
                        </p>

                        <label className="block text-sm font-medium text-gray-300 mb-2">Tag Name</label>
                        <input
                            type="text"
                            value={tagName}
                            onChange={(e) => setTagName(e.target.value)}
                            placeholder="Enter tag name..."
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                            autoFocus
                            maxLength={50}
                        />

                        {existingTags.length > 0 && (
                            <div className="mt-3">
                                <label className="block text-sm font-medium text-gray-400 mb-2">Suggested tags:</label>
                                <div className="flex flex-wrap gap-2">
                                    {existingTags.map((tag) => (
                                        <button
                                            key={tag.id}
                                            type="button"
                                            onClick={() => setTagName(tag.name)}
                                            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-full transition-colors border border-gray-600 hover:border-gray-500"
                                        >
                                            {tag.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!tagName.trim()}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors text-sm shadow disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Add Tag
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddTagToFolderModal;
