import React, { useEffect, useState } from "react";

interface ChangeIconModalProps {
    show: boolean;
    folderName: string;
    currentIcon: string | null;
    onConfirm: (icon: string | null) => void;
    onCancel: () => void;
}

const COMMON_EMOJIS = [
    "📁",
    "📂",
    "🎬",
    "🎥",
    "🎞️",
    "📺",
    "🎦",
    "🎪",
    "🎭",
    "🎨",
    "🎮",
    "🎯",
    "🎲",
    "🎰",
    "📚",
    "📖",
    "📕",
    "📗",
    "📘",
    "📙",
    "📔",
    "🎵",
    "🎶",
    "🎼",
    "🎹",
    "🎸",
    "🎺",
    "🎷",
    "🎃",
    "🎄",
    "🎆",
    "🎇",
    "✨",
    "🎈",
    "🎉",
    "💼",
    "📦",
    "🗂️",
    "🗃️",
    "🗄️",
    "📋",
    "📌",
    "⭐",
    "🌟",
    "💫",
    "🔥",
    "💎",
    "🏆",
    "🎖️",
    "❤️",
    "💙",
    "💚",
    "💛",
    "🧡",
    "💜",
    "🖤",
    "🍎",
    "🍕",
    "🍔",
    "🍟",
    "🍿",
    "🎂",
    "🍰",
    "⚽",
    "🏀",
    "🏈",
    "⚾",
    "🎾",
    "🏐",
    "🏉",
    "🚗",
    "🚕",
    "🚙",
    "🚌",
    "🚎",
    "🏎️",
    "🚓",
    "🐶",
    "🐱",
    "🦊",
    "🐻",
    "🐼",
    "🐨",
    "🐯",
    "🌍",
    "🌎",
    "🌏",
    "🌐",
    "🗺️",
    "🧭",
    "🏔️",
    "🍀",
    "🌸",
    "🌞",
    "🌝",
    "🌛",
    "🌟",
    "🌈",
    "❄️",
    "☂️",
    "🌪️",
    "🌈",
    "🌊",
    "🌋",
    "💀",
];

const ChangeIconModal: React.FC<ChangeIconModalProps> = ({ show, folderName, currentIcon, onConfirm, onCancel }) => {
    const [selectedIcon, setSelectedIcon] = useState<string | null>(currentIcon);
    const [customEmoji, setCustomEmoji] = useState("");

    useEffect(() => {
        if (show) {
            setSelectedIcon(currentIcon);
            setCustomEmoji("");
        }
    }, [show, currentIcon]);

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

    const handleEmojiClick = (emoji: string) => {
        setSelectedIcon(emoji);
        setCustomEmoji("");
    };

    const handleCustomEmojiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setCustomEmoji(value);
        if (value.trim()) {
            setSelectedIcon(value.trim());
        }
    };

    const handleResetToDefault = () => {
        setSelectedIcon(null);
        setCustomEmoji("");
    };

    const handleConfirm = () => {
        onConfirm(selectedIcon);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
            <div className="absolute inset-0 backdrop-blur-md bg-black/30 transition-opacity" onClick={onCancel}></div>

            <div
                className="relative bg-gray-900/90 rounded-lg shadow-lg max-w-lg w-full mx-4 p-6 backdrop-blur-xl border border-gray-700"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <svg
                                className="w-6 h-6 text-blue-600"
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
                        </div>
                        <h3 className="text-lg font-semibold text-gray-200">Change Folder Icon</h3>
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

                <div className="mb-4">
                    <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                        <p className="text-sm text-gray-400 truncate">{folderName}</p>
                    </div>
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Select an emoji</label>
                    <div className="grid grid-cols-7 gap-2 max-h-64 overflow-y-auto p-2 bg-gray-800/50 rounded-lg border border-gray-700">
                        {COMMON_EMOJIS.map((emoji, index) => (
                            <button
                                key={index}
                                onClick={() => handleEmojiClick(emoji)}
                                className={`text-2xl p-2 rounded hover:bg-gray-700 transition-colors ${
                                    selectedIcon === emoji ? "bg-blue-600 ring-2 ring-blue-400" : ""
                                }`}
                                title={emoji}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Or enter custom emoji</label>
                    <input
                        type="text"
                        value={customEmoji}
                        onChange={handleCustomEmojiChange}
                        placeholder="Paste any emoji here..."
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        maxLength={10}
                    />
                </div>

                <div className="mb-4">
                    <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-400">Current preview:</p>
                            <p className="text-3xl mt-1">{selectedIcon || "📁"}</p>
                        </div>
                        <button
                            onClick={handleResetToDefault}
                            className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 hover:border-gray-600 rounded transition-colors"
                        >
                            Reset to default
                        </button>
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
                        onClick={handleConfirm}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-sm shadow"
                    >
                        Save Icon
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChangeIconModal;
