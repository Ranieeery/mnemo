import React from 'react';

interface ConfirmMarkAllWatchedModalProps {
    show: boolean;
    folderName: string;
    totalVideos: number;
    unwatchedVideos: number;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmMarkAllWatchedModal: React.FC<ConfirmMarkAllWatchedModalProps> = ({
    show,
    folderName,
    totalVideos,
    unwatchedVideos,
    onConfirm,
    onCancel
}) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-700 shadow-2xl">
                <div className="flex items-start gap-4 mb-4">
                    <div className="flex-shrink-0">
                        <svg 
                            className="w-10 h-10 text-blue-400" 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                        >
                            <path 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                strokeWidth={2} 
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-100 mb-2">
                            Marcar Tudo como Visto
                        </h3>
                        <p className="text-gray-300 mb-2">
                            Deseja marcar todos os vídeos da pasta <span className="font-semibold text-blue-400">"{folderName}"</span> como assistidos?
                        </p>
                        <div className="bg-gray-900 rounded-md p-3 mt-3">
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-400">Total de vídeos:</span>
                                <span className="text-gray-200 font-medium">{totalVideos}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Não assistidos:</span>
                                <span className="text-orange-400 font-medium">{unwatchedVideos}</span>
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
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path 
                                fillRule="evenodd" 
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" 
                                clipRule="evenodd" 
                            />
                        </svg>
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmMarkAllWatchedModal;
