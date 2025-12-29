import React from 'react';

export const ApiKeyStatus: React.FC = () => {
  const handleOpenKeyManager = async () => {
    const aistudio = (window as any).aistudio;
    if (aistudio && aistudio.openSelectKey) {
      await aistudio.openSelectKey();
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs text-zinc-400">
      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
      <span>Gemini 3 Pro Connected</span>
      <button 
        onClick={handleOpenKeyManager}
        className="ml-2 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
      >
        Change Key
      </button>
    </div>
  );
};