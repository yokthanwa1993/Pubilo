import React from 'react';
import { GeneratedImage } from '../types';

interface ImageModalProps {
  image: GeneratedImage | null;
  onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ image, onClose }) => {
  if (!image) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="relative max-w-5xl w-full max-h-[90vh] flex flex-col items-center" 
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute -top-12 right-0 text-white hover:text-yellow-400 transition-colors text-xl font-bold p-2"
        >
          Close [x]
        </button>
        
        <img 
          src={image.url} 
          alt={image.prompt} 
          className="w-full h-auto max-h-[75vh] object-contain rounded-lg border border-zinc-800 shadow-2xl"
        />
        
        <div className="mt-4 w-full bg-zinc-900/80 p-6 rounded-lg border border-zinc-800 backdrop-blur-md">
          <p className="text-zinc-100 text-lg mb-2 font-light">{image.prompt}</p>
          <div className="flex gap-4 text-sm text-zinc-400 font-mono">
            <span>{image.aspectRatio}</span>
            <span>•</span>
            <span>{image.resolution}</span>
            <span>•</span>
            <span>{new Date(image.timestamp).toLocaleTimeString()}</span>
            <div className="flex-grow"></div>
             <a 
              href={image.url} 
              download={`banana-pro-${image.id}.png`}
              className="text-yellow-400 hover:text-yellow-300 font-bold uppercase tracking-wider text-xs"
            >
              Download PNG
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
