import React, { useEffect, useState } from "react";
import { getAllTags, deleteTag, removeTagFromAllVideos, deleteAllTags } from "../../database";

interface Tag {
    id: number;
    name: string;
}

interface TagManagementModalProps {
    show: boolean;
    onClose: () => void;
    onTagsChanged: () => void;
}

const TagManagementModal: React.FC<TagManagementModalProps> = ({ show, onClose, onTagsChanged }) => {
    const [tags, setTags] = useState<Tag[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<{ type: "tag" | "remove" | "all"; tagId?: number } | null>(null);

    useEffect(() => {
        if (show) {
            loadTags();
        }
    }, [show]);

    useEffect(() => {
        if (!show) return;

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (confirmDelete) {
                    setConfirmDelete(null);
                } else {
                    onClose();
                }
            }
        };

        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [show, onClose, confirmDelete]);

    const loadTags = async () => {
        setIsLoading(true);
        try {
            const allTags = await getAllTags();
            setTags(allTags);
        } catch (error) {
            console.error("Error loading tags:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteTag = async (tagId: number) => {
        setConfirmDelete({ type: "tag", tagId });
    };

    const handleRemoveFromAllVideos = async (tagId: number) => {
        setConfirmDelete({ type: "remove", tagId });
    };

    const handleDeleteAllTags = () => {
        setConfirmDelete({ type: "all" });
    };

    const executeConfirmedAction = async () => {
        if (!confirmDelete) return;

        setIsLoading(true);
        try {
            if (confirmDelete.type === "tag" && confirmDelete.tagId) {
                await deleteTag(confirmDelete.tagId);
                alert("Tag deleted successfully!");
            } else if (confirmDelete.type === "remove" && confirmDelete.tagId) {
                const count = await removeTagFromAllVideos(confirmDelete.tagId);
                alert(`Tag removed from ${count} video(s)!`);
            } else if (confirmDelete.type === "all") {
                const count = await deleteAllTags();
                alert(`${count} tag(s) deleted successfully!`);
            }

            await loadTags();
            onTagsChanged();
        } catch (error) {
            console.error("Error performing tag operation:", error);
            alert("Error performing operation");
        } finally {
            setIsLoading(false);
            setConfirmDelete(null);
        }
    };

    if (!show) return null;

    if (confirmDelete) {
        const getConfirmMessage = () => {
            if (confirmDelete.type === "tag") {
                const tag = tags.find((t) => t.id === confirmDelete.tagId);
                return {
                    title: "Delete Tag",
                    message: `Are you sure you want to delete the tag "${tag?.name}"? This will remove it from all videos.`,
                    buttonText: "Delete Tag",
                    buttonColor: "bg-red-600 hover:bg-red-700",
                };
            } else if (confirmDelete.type === "remove") {
                const tag = tags.find((t) => t.id === confirmDelete.tagId);
                return {
                    title: "Remove Tag from All Videos",
                    message: `Are you sure you want to remove the tag "${tag?.name}" from all videos? The tag will still exist but won't be associated with any video.`,
                    buttonText: "Remove from All",
                    buttonColor: "bg-orange-600 hover:bg-orange-700",
                };
            } else {
                return {
                    title: "Delete All Tags",
                    message: `Are you sure you want to delete ALL ${tags.length} tags? This will remove them from all videos permanently.`,
                    buttonText: "Delete All Tags",
                    buttonColor: "bg-red-600 hover:bg-red-700",
                };
            }
        };

        const { title, message, buttonText, buttonColor } = getConfirmMessage();

        return (
            <div className="fixed inset-0 flex items-center justify-center z-[60] px-4 py-8">
                <div
                    className="absolute inset-0 backdrop-blur-md bg-black/50 transition-opacity"
                    onClick={() => setConfirmDelete(null)}
                ></div>

                <div
                    className="relative bg-gray-900/95 rounded-lg shadow-lg max-w-md w-full mx-4 p-6 backdrop-blur-xl border border-gray-700"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-200">{title}</h3>
                        <button onClick={() => setConfirmDelete(null)} className="text-gray-400 hover:text-gray-200">
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

                    <p className="text-gray-300 mb-6">{message}</p>

                    <div className="flex justify-end space-x-3">
                        <button
                            onClick={() => setConfirmDelete(null)}
                            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={executeConfirmedAction}
                            className={`px-4 py-2 text-sm font-medium text-white rounded-lg ${buttonColor}`}
                        >
                            {buttonText}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 px-4 py-8">
            <div className="absolute inset-0 backdrop-blur-md bg-black/30 transition-opacity" onClick={onClose}></div>

            <div
                className="relative bg-gray-900/90 rounded-lg shadow-lg max-w-2xl w-full mx-4 backdrop-blur-xl border border-gray-700 max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-6 border-b border-gray-700">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                            <svg
                                className="w-6 h-6 text-purple-600"
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
                        <h3 className="text-xl font-semibold text-gray-200">Tag Management</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-200">
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

                <div className="flex-1 overflow-y-auto p-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <svg className="animate-spin w-8 h-8 text-purple-500" fill="none" viewBox="0 0 24 24">
                                <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                ></circle>
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                            </svg>
                        </div>
                    ) : tags.length === 0 ? (
                        <div className="text-center py-8">
                            <svg
                                className="w-16 h-16 text-gray-600 mx-auto mb-4"
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
                            <p className="text-gray-400">No tags found</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {tags.map((tag) => (
                                <div
                                    key={tag.id}
                                    className="flex items-center justify-between p-4 bg-gray-800/70 border border-gray-700/60 rounded-lg hover:bg-gray-800 transition-colors"
                                >
                                    <div className="flex items-center space-x-3">
                                        <svg
                                            className="w-5 h-5 text-purple-400"
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
                                        <span className="font-medium text-gray-200">{tag.name}</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <button
                                            onClick={() => handleRemoveFromAllVideos(tag.id)}
                                            className="px-3 py-1.5 text-xs font-medium text-orange-400 bg-orange-950/50 hover:bg-orange-900/50 rounded-md transition-colors border border-orange-800/50"
                                            title="Remove from all videos"
                                        >
                                            Remove from All
                                        </button>
                                        <button
                                            onClick={() => handleDeleteTag(tag.id)}
                                            className="p-2 text-red-400 hover:bg-red-950/50 rounded-md transition-colors"
                                            title="Delete tag"
                                        >
                                            <svg
                                                className="w-5 h-5"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {tags.length > 0 && (
                    <div className="p-6 border-t border-gray-700">
                        <button
                            onClick={handleDeleteAllTags}
                            className="w-full px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center justify-center space-x-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                            </svg>
                            <span>Delete All Tags ({tags.length})</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TagManagementModal;
