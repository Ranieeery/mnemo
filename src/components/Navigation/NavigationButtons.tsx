import React from 'react';

interface NavigationButtonsProps {
    canGoBack: boolean;
    canGoForward: boolean;
    onGoBack: () => void;
    onGoForward: () => void;
}

const NavigationButtons: React.FC<NavigationButtonsProps> = ({
    canGoBack,
    canGoForward,
    onGoBack,
    onGoForward
}) => {
    return (
        <div className="flex items-center space-x-1">
            <button
                onClick={onGoBack}
                disabled={!canGoBack}
                className={`p-2 rounded-md transition-colors ${
                    canGoBack
                        ? 'hover:bg-gray-700 text-gray-300 hover:text-white'
                        : 'text-gray-600 cursor-not-allowed'
                }`}
                title="Go back (Alt + ←)"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15 19l-7-7 7-7"/>
                </svg>
            </button>
            <button
                onClick={onGoForward}
                disabled={!canGoForward}
                className={`p-2 rounded-md transition-colors ${
                    canGoForward
                        ? 'hover:bg-gray-700 text-gray-300 hover:text-white'
                        : 'text-gray-600 cursor-not-allowed'
                }`}
                title="Go forward (Alt + →)"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M9 5l7 7-7 7"/>
                </svg>
            </button>
        </div>
    );
};

export default NavigationButtons;
