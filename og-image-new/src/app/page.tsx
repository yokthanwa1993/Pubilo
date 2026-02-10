"use client";

import { useState, useEffect } from "react";

const FONTS = [
  // Popular
  { id: "noto-sans-thai", name: "Noto Sans Thai" },
  { id: "noto-serif-thai", name: "Noto Serif Thai" },
  { id: "noto-sans-thai-looped", name: "Noto Sans Thai Looped" },
  { id: "sarabun", name: "Sarabun" },
  { id: "prompt", name: "Prompt" },
  { id: "kanit", name: "Kanit" },
  { id: "mitr", name: "Mitr" },
  { id: "chakra-petch", name: "Chakra Petch" },
  // More Thai Fonts
  { id: "anuphan", name: "Anuphan" },
  { id: "athiti", name: "Athiti" },
  { id: "bai-jamjuree", name: "Bai Jamjuree" },
  { id: "charm", name: "Charm" },
  { id: "charmonman", name: "Charmonman" },
  { id: "fahkwang", name: "Fahkwang" },
  { id: "ibm-plex-sans-thai", name: "IBM Plex Sans Thai" },
  { id: "ibm-plex-sans-thai-looped", name: "IBM Plex Sans Thai Looped" },
  { id: "k2d", name: "K2D" },
  { id: "kodchasan", name: "Kodchasan" },
  { id: "krub", name: "Krub" },
  { id: "kulim-park", name: "Kulim Park" },
  { id: "mali", name: "Mali" },
  { id: "maitree", name: "Maitree" },
  { id: "niramit", name: "Niramit" },
  { id: "pridi", name: "Pridi" },
  { id: "srisakdi", name: "Srisakdi" },
  { id: "taviraj", name: "Taviraj" },
  { id: "thasadith", name: "Thasadith" },
  { id: "trirong", name: "Trirong" },
  // Additional Thai Fonts
  { id: "chonburi", name: "Chonburi" },
  { id: "itim", name: "Itim" },
  { id: "koho", name: "KoHo" },
  { id: "pattaya", name: "Pattaya" },
  { id: "playpen-sans-thai", name: "Playpen Sans Thai" },
  { id: "sriracha", name: "Sriracha" },
];

const FREEIMAGE_API_KEY = "6d207e02198a847aa98d0a2a901485a5";

export default function Home() {
  const [text, setText] = useState("สวัสดีชาวโลก");
  const [imageUrl, setImageUrl] = useState("");
  const [font, setFont] = useState("noto-sans-thai");
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResponse, setUploadResponse] = useState<object | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("text", text);
    params.set("font", font);
    if (imageUrl) params.set("image", imageUrl);
    setPreviewUrl(`/api/og?${params.toString()}`);
  }, [text, imageUrl, font]);

  const handleDownload = async () => {
    try {
      const response = await fetch(previewUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "og-image.webp";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const handleUpload = async () => {
    try {
      setUploading(true);
      setUploadResponse(null);

      // Fetch the image as blob
      const response = await fetch(previewUrl);
      const blob = await response.blob();

      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(blob);
      const base64 = await base64Promise;

      // Upload to freeimage.host
      const formData = new FormData();
      formData.append("key", FREEIMAGE_API_KEY);
      formData.append("action", "upload");
      formData.append("source", base64);
      formData.append("format", "json");

      const uploadRes = await fetch("https://freeimage.host/api/1/upload", {
        method: "POST",
        body: formData,
      });

      const json = await uploadRes.json();
      setUploadResponse(json);
    } catch (error) {
      console.error("Upload failed:", error);
      setUploadResponse({ error: "Upload failed", details: String(error) });
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          OG Image Generator
        </h1>
        <p className="text-gray-400 mb-8">Create beautiful Open Graph images for your website</p>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Form Section */}
          <div className="space-y-6">
            <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-sm">1</span>
                Configure
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Text
                  </label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="w-full px-4 py-4 bg-gray-900 border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition resize-none text-lg"
                    placeholder="Enter your text"
                    rows={6}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Font
                  </label>
                  <select
                    value={font}
                    onChange={(e) => setFont(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  >
                    {FONTS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Background Image URL
                  </label>
                  <input
                    type="text"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                    placeholder="https://example.com/image.jpg"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleDownload}
                className="flex-1 py-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-xl font-semibold text-lg transition transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Download
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="flex-1 py-4 bg-gradient-to-r from-green-500 to-teal-600 hover:from-green-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold text-lg transition transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                {uploading ? "Uploading..." : "Upload"}
              </button>
            </div>

            {/* API URL */}
            <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700">
              <p className="text-xs text-gray-400 mb-2">API URL:</p>
              <code className="text-xs text-blue-400 break-all">{previewUrl}</code>
            </div>

            {/* Upload Response */}
            {uploadResponse && (
              <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-6 border border-gray-700">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center text-sm">3</span>
                  Upload Response
                </h2>
                <pre className="bg-gray-900 rounded-xl p-4 overflow-auto max-h-96 text-xs text-green-400">
                  {JSON.stringify(uploadResponse, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Preview Section */}
          <div className="space-y-4">
            <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center text-sm">2</span>
                Preview
              </h2>

              <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-gray-900 border border-gray-600">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="OG Image Preview"
                    className="w-full h-full object-cover"
                    key={previewUrl}
                  />
                )}
              </div>

              <p className="text-sm text-gray-400 mt-3 text-center">
                800 × 1200 pixels (2:3 ratio)
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
