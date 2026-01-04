import React, { useRef, useState } from 'react';
import { ReferenceImage } from '../types';
import { v4 as uuidv4 } from 'uuid';

// Fallback ID generator if uuid is not available in environment
const generateId = () => Math.random().toString(36).substring(2, 9);

interface ControlsProps {
  referenceImages: ReferenceImage[];
  setReferenceImages: React.Dispatch<React.SetStateAction<ReferenceImage[]>>;
  isGenerating: boolean;
  loadingStatus?: string;
  onGenerate: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  referenceImages,
  setReferenceImages,
  isGenerating,
  loadingStatus,
  onGenerate
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(Array.from(e.target.files));
    }
  };

  const processFiles = (files: File[]) => {
    // Limit total images to 10
    const remainingSlots = 10 - referenceImages.length;
    const filesToProcess = files.slice(0, remainingSlots);

    filesToProcess.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const base64Data = base64String.split(',')[1];
        const mimeType = file.type;
        
        const newImage: ReferenceImage = {
          id: generateId(),
          data: base64Data,
          mimeType: mimeType
        };

        setReferenceImages(prev => [...prev, newImage]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (idToRemove: string) => {
    setReferenceImages(prev => prev.filter(img => img.id !== idToRemove));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-6">
      
      {/* Style Info Card */}
      <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-xl flex items-start gap-3">
        <div className="bg-yellow-500/10 text-yellow-500 p-2 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
          </svg>
        </div>
        <div>
          <h3 className="text-white font-medium">Smart Auto-Montage</h3>
          <p className="text-zinc-400 text-sm mt-1">
            AI will first <strong>analyze your photos</strong> to determine the best layout and subject focus, then generate a dramatic "Thai News" cover.
          </p>
        </div>
      </div>

      {/* Dropzone */}
      <div 
        className={`relative border-2 border-dashed rounded-xl p-6 transition-all duration-300 flex flex-col items-center justify-center min-h-[200px]
          ${dragActive ? 'border-yellow-500 bg-yellow-500/10' : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/50'}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileChange} 
          className="hidden" 
          accept="image/*"
          multiple
        />
        
        {referenceImages.length > 0 ? (
          <div className="w-full">
            <div className="grid grid-cols-3 gap-2 mb-4">
              {referenceImages.map((img) => (
                <div key={img.id} className="relative group aspect-square">
                  <img 
                    src={`data:${img.mimeType};base64,${img.data}`} 
                    className="w-full h-full object-cover rounded-lg border border-zinc-700" 
                    alt="upload" 
                  />
                  <button 
                    onClick={() => removeImage(img.id)}
                    className="absolute top-1 right-1 bg-black/70 hover:bg-red-500 text-white p-1 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                  </button>
                </div>
              ))}
              {referenceImages.length < 10 && (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center border border-zinc-700 border-dashed rounded-lg cursor-pointer hover:bg-zinc-800/50 aspect-square"
                >
                  <span className="text-2xl text-zinc-500">+</span>
                </div>
              )}
            </div>
            <div className="flex justify-between items-center text-sm">
               <span className="text-zinc-400">{referenceImages.length} / 10 images</span>
               <button 
                  onClick={() => setReferenceImages([])}
                  className="text-red-400 hover:text-red-300"
               >
                 Clear All
               </button>
            </div>
          </div>
        ) : (
          <div 
            className="text-center cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-3 text-zinc-400">
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
               </svg>
            </div>
            <p className="text-zinc-300 font-medium mb-1">Click to Upload Photos</p>
            <p className="text-zinc-500 text-xs">Supports up to 10 images</p>
          </div>
        )}
      </div>

      {/* Generate Button */}
      <button
        onClick={onGenerate}
        disabled={isGenerating || referenceImages.length === 0}
        className={`
          relative w-full py-4 rounded-xl font-bold text-lg tracking-wide uppercase transition-all duration-300
          ${isGenerating || referenceImages.length === 0
            ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
            : 'bg-gradient-to-r from-red-600 to-red-700 text-white hover:shadow-[0_0_30px_rgba(220,38,38,0.4)] hover:scale-[1.01]'
          }
        `}
      >
        {isGenerating ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {loadingStatus || "Processing..."}
          </span>
        ) : (
          "Generate News Cover"
        )}
      </button>
    </div>
  );
};
