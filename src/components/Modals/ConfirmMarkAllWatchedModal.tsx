import React, { useEffect } from "react";

interface ConfirmMarkAllWatchedModalProps {
    show: boolean;
    folderName: string;
    totalVideos: number;
    unwatchedVideos: number;
    mode?: "watch" | "unwatch";
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmMarkAllWatchedModal: React.FC<ConfirmMarkAllWatchedModalProps> = ({
    show,
    folderName,
    totalVideos,
    unwatchedVideos,
    mode = "watch",
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

    const isWatchMode = mode === "watch";
    const watchedVideos = totalVideos - unwatchedVideos;
    const iconColor = isWatchMode ? "text-blue-400" : "text-orange-400";
    const title = isWatchMode ? "Marcar Tudo como Visto" : "Desmarcar Tudo como Visto";
    const description = isWatchMode
        ? `Deseja marcar todos os vídeos da pasta "${folderName}" como assistidos?`
        : `Deseja desmarcar todos os vídeos assistidos da pasta "${folderName}"?`;
    const affectedCount = isWatchMode ? unwatchedVideos : watchedVideos;
    const affectedLabel = isWatchMode ? "Serão marcados" : "Serão desmarcados";
    const confirmButtonColor = isWatchMode ? "bg-blue-600 hover:bg-blue-700" : "bg-orange-600 hover:bg-orange-700";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
            <div className="absolute inset-0 backdrop-blur-md bg-black/30 transition-opacity" onClick={onCancel} />
            <div className="relative bg-gray-900/90 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-700 shadow-2xl backdrop-blur-xl">
                <div className="flex items-start gap-4 mb-4">
                    <div className="flex-shrink-0">
                        <svg className={`w-10 h-10 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {isWatchMode ? (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            ) : (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                                />
                            )}
                        </svg>
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-100 mb-2">{title}</h3>
                        <p className="text-gray-300 mb-2">{description}</p>
                        <div className="bg-gray-900 rounded-md p-3 mt-3">
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-400">Total de vídeos:</span>
                                <span className="text-gray-200 font-medium">{totalVideos}</span>
                            </div>
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-400">{isWatchMode ? "Não assistidos" : "Assistidos"}:</span>
                                <span className={`font-medium ${isWatchMode ? "text-orange-400" : "text-green-400"}`}>
                                    {isWatchMode ? unwatchedVideos : watchedVideos}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm pt-2 border-t border-gray-700">
                                <span className="text-gray-400">{affectedLabel}:</span>
                                <span className={`font-medium ${iconColor}`}>{affectedCount}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 justify-end mt-6">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors font-medium"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 ${confirmButtonColor} text-white rounded-lg transition-colors font-medium flex items-center gap-2`}
                    >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            {isWatchMode ? (
                                <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                />
                            ) : (
                                <path
                                    fillRule="evenodd"
                                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                    clipRule="evenodd"
                                />
                            )}
                        </svg>
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmMarkAllWatchedModal;
