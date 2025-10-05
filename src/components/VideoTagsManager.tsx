import React, {useEffect, useState} from 'react';
import {addTagToVideo, getAllTags, getVideoTags, removeTagFromVideo, Tag} from '../database';
import {ProcessedVideo} from '../types/video';

interface VideoTagsManagerProps {
    video: ProcessedVideo;
    onTagsChange?: () => void;
}

export const VideoTagsManager: React.FC<VideoTagsManagerProps> = ({video, onTagsChange}) => {
    const [videoTags, setVideoTags] = useState<Tag[]>([]);
    const [allTags, setAllTags] = useState<Tag[]>([]);
    const [newTagName, setNewTagName] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
        loadTags();
    }, [video.id]);

    const loadTags = async () => {
        if (!video.id) return;

        setLoading(true);
        try {
            const [videoTagsData, allTagsData] = await Promise.all([
                getVideoTags(video.id),
                getAllTags()
            ]);

            setVideoTags(videoTagsData);
            setAllTags(allTagsData);
        } catch (error) {
            console.error("Error loading tags:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddTag = async () => {
        if (!video.id || !newTagName.trim()) return;

        try {
            await addTagToVideo(video.id, newTagName.trim());

            await loadTags();

            setNewTagName("");

            onTagsChange?.();
        } catch (error) {
            console.error("Error adding tag:", error);
            alert("Error adding tag. Please try again.");
        }
    };

    const handleRemoveTag = async (tagId: number) => {
        if (!video.id) return;

        try {
            await removeTagFromVideo(video.id, tagId);

            await loadTags();

            onTagsChange?.();
        } catch (error) {
            console.error("Error removing tag:", error);
            alert("Error removing tag. Please try again.");
        }
    };

    const handleAddExistingTag = async (tagId: number) => {
        if (!video.id) return;

        if (videoTags.some(tag => tag.id === tagId)) {
            return;
        }

        try {
            const tag = allTags.find(t => t.id === tagId);
            if (!tag) return;

            await addTagToVideo(video.id, tag.name);

            await loadTags();

            onTagsChange?.();
        } catch (error) {
            console.error("Error adding existing tag:", error);
            alert("Error adding tag. Please try again.");
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleAddTag();
        }
    };

    if (!video.id) {
        return (
            <div className="mb-4">
                <p className="text-sm text-gray-500 italic">Video must be saved to database to add tags.</p>
            </div>
        );
    }

    return (
        <div className="mb-4">

            {loading ? (
                <div className="text-sm text-gray-500">Loading tags...</div>
            ) : (
                <>
                    <div className="flex flex-wrap gap-2 mb-3">
                        {videoTags.map(tag => (
                            <span
                                key={tag.id}
                                className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-blue-600 text-white"
                            >
                {tag.name}
                                <button
                                    onClick={() => handleRemoveTag(tag.id)}
                                    className="ml-1 hover:text-red-300 transition-colors"
                                    title="Remove tag"
                                >
                  ×
                </button>
              </span>
                        ))}
                        {videoTags.length === 0 && (
                            <span className="text-sm text-gray-500 italic">No tags added</span>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Add new tag..."
                            className="flex-1 px-3 py-1 text-sm bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                            onClick={handleAddTag}
                            disabled={!newTagName.trim()}
                            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md transition-colors"
                        >
                            Add
                        </button>
                    </div>

                    {allTags.length > 0 && (
                        <div className="mt-3">
                            <h5 className="text-xs text-gray-400 mb-2">Suggested tags:</h5>
                            <div className="flex flex-wrap gap-1">
                                {allTags
                                    .filter(tag => !videoTags.some(vt => vt.id === tag.id))
                                    .slice(0, 10)
                                    .map(tag => (
                                        <button
                                            key={tag.id}
                                            onClick={() => handleAddExistingTag(tag.id)}
                                            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md transition-colors"
                                        >
                                            + {tag.name}
                                        </button>
                                    ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
