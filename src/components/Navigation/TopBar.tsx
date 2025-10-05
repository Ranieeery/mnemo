import React from "react";
import NavigationButtons from "../Navigation/NavigationButtons";
import SearchBar from "../Search/SearchBar";

interface TopBarProps {
    selectedFolder: string | null;
    canGoBack: boolean;
    canGoForward: boolean;
    onGoBack: () => void;
    onGoForward: () => void;
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    isSearching: boolean;
    onClearSearch: () => void;
}

const TopBar: React.FC<TopBarProps> = ({
    selectedFolder,
    canGoBack,
    canGoForward,
    onGoBack,
    onGoForward,
    searchTerm,
    setSearchTerm,
    isSearching,
    onClearSearch,
}) => {
    return (
        <div className="bg-gray-800 border-b border-gray-700 p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <NavigationButtons
                        canGoBack={canGoBack}
                        canGoForward={canGoForward}
                        onGoBack={onGoBack}
                        onGoForward={onGoForward}
                    />

                    <h2 className="text-lg font-semibold">{selectedFolder || "Welcome to Mnemo"}</h2>
                </div>

                <SearchBar
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    isSearching={isSearching}
                    onClearSearch={onClearSearch}
                />
            </div>
        </div>
    );
};

export default TopBar;
