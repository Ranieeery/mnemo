import React from 'react';

interface SidebarProps {
    libraryFolders: string[];
    selectedFolder: string | null;
    folderIndexingStatus: { [key: string]: boolean };
    onAddFolder: () => void;
    onSelectFolder: (folder: string) => void;
    onRemoveFolderRequest: (folder: string) => void;
    onGoToHomePage: () => void;
    onOpenSettings: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
    libraryFolders,
    selectedFolder,
    folderIndexingStatus,
    onAddFolder,
    onSelectFolder,
    onRemoveFolderRequest,
    onGoToHomePage,
    onOpenSettings
}) => {
    return (
        <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-gray-700">
                <h1
                    className="text-xl font-bold text-blue-400 cursor-pointer hover:text-blue-300 transition-colors"
                    onClick={onGoToHomePage}
                    title="Return to Home"
                >
                    Mnemo
                </h1>
                <p className="text-sm text-gray-400">Video Library</p>
            </div>

            {/* Library Section */}
            <div className="flex-1 p-4">
                <div className="mb-4">
                    <h2 className="text-sm font-semibold text-gray-300 mb-2">LIBRARY</h2>
                    <button
                        onClick={onAddFolder}
                        className="w-full px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors mb-2"
                    >
                        + Add Folder
                    </button>
                    <button
                        onClick={onOpenSettings}
                        className="w-full px-3 py-2 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
                    >
                        ⚙️ Settings
                    </button>
                </div>

                {/* Directories List */}
                <div className="space-y-1">
                    {libraryFolders.length === 0 ? (
                        <div className="text-sm text-gray-500">No folders added yet</div>
                    ) : (
                        libraryFolders.map((folder, index) => (
                            <div
                                key={index}
                                className={`text-sm rounded-md p-2 transition-all group relative ${
                                    selectedFolder === folder
                                        ? "bg-blue-600 text-white"
                                        : "text-gray-400 hover:bg-gray-700"
                                }`}
                            >
                                <div
                                    onClick={() => onSelectFolder(folder)}
                                    className="cursor-pointer pr-8"
                                >
                                    <div className="font-medium truncate flex items-center" title={folder}>
                                        <span>📁</span>
                                        <span className="ml-2 truncate">{folder.split(/[/\\]/).pop()}</span>
                                        {folderIndexingStatus[folder] && (
                                            <div className="ml-2 animate-spin rounded-full h-3 w-3 border-b-2 border-current"></div>
                                        )}
                                    </div>
                                    <div className="text-xs opacity-75 truncate">
                                        {folder}
                                    </div>
                                </div>
                                {/* Ícone de lixeira que aparece no hover */}
                                {!folderIndexingStatus[folder] && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemoveFolderRequest(folder);
                                        }}
                                        className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 p-1 rounded transition-all duration-200 hover:bg-red-400/20"
                                        title="Remove folder from library"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor"
                                             viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                        </svg>
                                    </button>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default Sidebar;
