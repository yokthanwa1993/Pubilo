import React, { useState } from 'react';
import { ApiKeyStatus } from './components/ApiKeyStatus';
import { Controls } from './components/Controls';
import { ImageModal } from './components/ImageModal';
import { analyzeImages, generateImageFromGemini } from './services/geminiService';
import { GeneratedImage, ReferenceImage } from './types';
import { CONFIG } from './prompts';

// Simple ID generator
const generateId = () => Math.random().toString(36).substring(2, 9);

const App: React.FC = () => {
  // State
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);

  // Generate Handler
  const handleGenerate = async () => {
    if (referenceImages.length === 0) return;

    setIsGenerating(true);
    setError(null);

    try {
      // Step 1: Analyze Images
      setLoadingStatus("Analyzing composition...");
      const analysisResult = await analyzeImages(referenceImages);
      console.log("Analysis Result:", analysisResult);

      // Step 2: Generate Image using analysis context
      setLoadingStatus(`Rendering ${CONFIG.variationCount} variations...`);
      const base64Images = await generateImageFromGemini(referenceImages, analysisResult);

      // Step 3: Add all generated images to state
      const newImages: GeneratedImage[] = base64Images.map(base64 => ({
        id: generateId(),
        url: base64,
        prompt: "News Montage Style", // Static label since prompt is hidden
        aspectRatio: CONFIG.aspectRatio,
        resolution: CONFIG.resolution,
        timestamp: Date.now()
      }));

      setGeneratedImages(prev => [...newImages, ...prev]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong during generation.");
    } finally {
      setIsGenerating(false);
      setLoadingStatus("");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-red-500/30">
      {/* Background Ambience - Changed to red for news vibe */}
      <div className="fixed inset-0 z-0 pointer-events-none">
         <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-900/10 rounded-full blur-[120px]"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-zinc-800/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-8 flex flex-col min-h-screen">
        
        {/* Header */}
        <header className="flex justify-between items-center mb-12 border-b border-zinc-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center font-bold text-white text-xl shadow-lg shadow-red-500/20">
              N
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">News Cover Gen</h1>
              <p className="text-zinc-500 text-xs tracking-widest uppercase">Banana Pro • Smart Montage</p>
            </div>
          </div>
          <ApiKeyStatus />
        </header>

        {/* Main Content Layout */}
        <div className="grid lg:grid-cols-12 gap-12 flex-grow">
          
          {/* Left Column: Controls */}
          <div className="lg:col-span-5 flex flex-col gap-8">
            <div className="sticky top-8">
              <h2 className="text-xl font-medium text-zinc-300 mb-6 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                Input Images
              </h2>
              
              <Controls 
                referenceImages={referenceImages}
                setReferenceImages={setReferenceImages}
                isGenerating={isGenerating}
                loadingStatus={loadingStatus}
                onGenerate={handleGenerate}
              />

              {error && (
                <div className="mt-6 p-4 bg-red-900/20 border border-red-900/50 rounded-lg text-red-200 text-sm">
                  <p className="font-bold mb-1">Error</p>
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Gallery/Results */}
          <div className="lg:col-span-7 flex flex-col">
            <h2 className="text-xl font-medium text-zinc-300 mb-6 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500"></span>
              Generated Covers (Batch of {CONFIG.variationCount})
            </h2>

            {generatedImages.length === 0 ? (
              <div className="flex-grow flex flex-col items-center justify-center border-2 border-dashed border-zinc-900 rounded-2xl bg-zinc-900/30 p-12 text-center h-[500px]">
                <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mb-4 text-zinc-700">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                </div>
                <h3 className="text-zinc-500 font-medium">No covers generated yet</h3>
                <p className="text-zinc-600 text-sm mt-2 max-w-xs">Upload images to create your first dramatic news montage.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
                {generatedImages.map((img) => (
                  <div 
                    key={img.id} 
                    className="group relative aspect-square rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 cursor-pointer"
                    onClick={() => setSelectedImage(img)}
                  >
                    <img 
                      src={img.url} 
                      alt={img.prompt}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                      <p className="text-white text-sm font-medium truncate">{img.prompt}</p>
                      <p className="text-zinc-400 text-xs mt-1">{img.resolution} • {img.aspectRatio}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
      
      {/* Footer */}
      <footer className="w-full text-center py-6 text-zinc-600 text-sm border-t border-zinc-900 mt-auto">
        &copy; {new Date().getFullYear()} News Cover Gen. Images generated by Gemini 3 Pro.
      </footer>

      {/* Modal */}
      <ImageModal image={selectedImage} onClose={() => setSelectedImage(null)} />
    </div>
  );
};

export default App;