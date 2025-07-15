"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import Image from 'next/image';

// --- Interfaces ---
interface YouTubeChannel {
  name: string;
  pfp: string;
}
interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category: string;
}
interface UploadClientProps {
  initialYoutubeChannel: YouTubeChannel | null;
  initialFacebookPage: FacebookPage | null;
}
interface UploadResult {
    platform: 'facebook' | 'youtube';
    status: 'success' | 'error';
    url?: string;
    message?: string;
}

// --- Component ---
export default function UploadClient({ initialYoutubeChannel, initialFacebookPage }: UploadClientProps) {
  const { user } = useAuth();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // This effect only runs on the client, after hydration is complete.
    setIsMounted(true);
  }, []);

  const [youtubeChannel, setYoutubeChannel] = useState(initialYoutubeChannel);
  const [facebookPage, setFacebookPage] = useState(initialFacebookPage);
  
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [schedulePost, setSchedulePost] = useState(false);
  const [publishAt, setPublishAt] = useState('');
  const [minScheduleTime, setMinScheduleTime] = useState('');
  const [shopeeLink, setShopeeLink] = useState('');
  const [lazadaLink, setLazadaLink] = useState('');
  const [useShopeeLink, setUseShopeeLink] = useState(false);
  const [useLazadaLink, setUseLazadaLink] = useState(false);

  useEffect(() => {
    const now = new Date();
    // Add 11 minutes to be safe and account for any slight delay
    const tenMinutesFromNow = new Date(now.getTime() + 11 * 60 * 1000); 
    
    // Format for datetime-local input: YYYY-MM-DDTHH:mm
    const year = tenMinutesFromNow.getFullYear();
    const month = String(tenMinutesFromNow.getMonth() + 1).padStart(2, '0');
    const day = String(tenMinutesFromNow.getDate()).padStart(2, '0');
    const hours = String(tenMinutesFromNow.getHours()).padStart(2, '0');
    const minutes = String(tenMinutesFromNow.getMinutes()).padStart(2, '0');
    
    setMinScheduleTime(`${year}-${month}-${day}T${hours}:${minutes}`);
  }, [schedulePost]); // Recalculate when the schedule checkbox is toggled

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { data } = event;
      if (data.type === 'facebook-connected' && data.page) setFacebookPage(data.page);
      if (data.type === 'youtube-connected' && data.channel) setYoutubeChannel(data.channel);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleYouTubeLogin = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) {
      alert("Please wait for authentication to complete.");
      return;
    }
    const statePayload = JSON.stringify({ uid: user.uid });
    const oauthUrl = `/api/auth/youtube?state=${encodeURIComponent(statePayload)}`;
    const width = 860, height = 700;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);
    window.open(oauthUrl, '_blank', `width=${width},height=${height},top=${top},left=${left}`);
  };
  
  const handleFacebookConnect = () => {
    if(!user) {
      alert("Please wait for authentication to complete.");
      return;
    }
    const facebookUrl = `/facebook`;
    const width = 860, height = 700;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);
    window.open(facebookUrl, '_blank', `width=${width},height=${height},top=${top},left=${left}`);
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
  };

  const handleScheduleToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSchedulePost(e.target.checked);
  };

  const handlePublishAtChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedTime = e.target.value;

    if (selectedTime && minScheduleTime && selectedTime < minScheduleTime) {
      // Silently switch to "Post Now" mode if the time is invalid
      setSchedulePost(false);
      setPublishAt('');
      return;
    }

    setPublishAt(selectedTime);
  }

  const truncateFileName = (fileName: string, maxLength: number = 30) => {
    if (fileName.length <= maxLength) return fileName;
    
    const extension = fileName.split('.').pop();
    const nameWithoutExt = fileName.slice(0, fileName.lastIndexOf('.'));
    const truncatedName = nameWithoutExt.slice(0, maxLength - extension!.length - 4) + '...';
    
    return `${truncatedName}.${extension}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fileType: 'video' | 'thumbnail') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (fileType === 'video') {
        setVideoFile(file);
      } else {
        setThumbnailFile(file);
        const reader = new FileReader();
        reader.onloadend = () => setThumbnailPreview(reader.result as string);
        reader.readAsDataURL(file);
      }
    }
  };

  const handleDragEvents = (e: React.DragEvent<HTMLDivElement>, isDragging: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(isDragging);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, fileType: 'video' | 'thumbnail') => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const mockEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileChange(mockEvent, fileType);
    }
  };

  const copyToClipboard = (text: string, buttonElement: HTMLButtonElement) => {
    navigator.clipboard.writeText(text).then(() => {
      const originalHTML = buttonElement.innerHTML;
      buttonElement.innerHTML = '✅ Copied!';
      buttonElement.classList.add('copied');
      
      setTimeout(() => {
        buttonElement.innerHTML = originalHTML;
        buttonElement.classList.remove('copied');
      }, 2500);
    });
  };

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!user) {
        alert("Authentication error. Please log in again.");
        return;
    }
    if (!videoFile || !description.trim()) {
      alert('Please select a video file and enter a description.');
      return;
    }

    if (schedulePost && !publishAt) {
      alert('Please select a date and time to schedule the post.');
      return;
    }

    // This client-side check is now a fallback, the input's `min` attribute should prevent this.
    if (schedulePost && publishAt) {
      const selectedDate = new Date(publishAt);
      const now = new Date();
      // Set seconds to 0 to compare fairly with datetime-local which has no seconds
      now.setSeconds(0, 0); 
      
      const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);

      if (selectedDate < tenMinutesFromNow) {
        alert('Scheduled time must be at least 10 minutes in the future (Facebook requires this).');
        return;
      }
    }

    // Clear previous results and start uploading
    setUploadResults([]);
    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus('Authenticating...');

    try {
        const idToken = await user.getIdToken();
        const authHeader = { 'Authorization': `Bearer ${idToken}` };
        const formData = new FormData();
        formData.append('video', videoFile);
        if (thumbnailFile) formData.append('thumbnail', thumbnailFile);
        
        // Create different descriptions for different platforms
        const hasLinks = (useShopeeLink && shopeeLink) || (useLazadaLink && lazadaLink);
        
        let facebookDescription;
        
        // YouTube always uses original description + standard hashtags
        const youtubeDescription = description + '\n\n#เล่าเรื่อง #คลิปไวรัล #viralvideo #shorts';
        
        if (hasLinks) {
          // When has links: Facebook uses template
          facebookDescription = `ตื่นมาไม่เจอฝันร้ายแบบในคลิป ต้องมีเต็นท์ดีๆ สักหลัง! 🦟
ปกป้องคุณจากยุงและแมลง ให้การแคมป์ปิ้งราบรื่น

`;
          if (useLazadaLink && lazadaLink) facebookDescription += `Lazada 🔵 : ${lazadaLink}\n`;
          if (useShopeeLink && shopeeLink) facebookDescription += `Shopee 🟠 : ${shopeeLink}\n`;
          facebookDescription += `\n#เครื่องครัว #รีวิวของใช้ในบ้าน #reels #viralvideo`;
        } else {
          // When no links: Facebook uses original description + standard hashtags
          facebookDescription = description + '\n\n#เล่าเรื่อง #คลิปไวรัล #reels #viralvideo';
        }
        
        formData.append('description', facebookDescription);
        formData.append('youtubeDescription', youtubeDescription);
        formData.append('originalDescription', description);
        formData.append('schedulePost', schedulePost.toString());
        if (schedulePost && publishAt) {
          // Convert local time from input to UTC ISO string before sending
          formData.append('publishAt', new Date(publishAt).toISOString());
        }

        const finalResults: UploadResult[] = [];

        // --- Facebook Upload ---
        if (facebookPage) {
            setUploadProgress(10);
            setUploadStatus('Uploading to Facebook Reels...');
            const fbResponse = await fetch('/api/upload/facebook', {
                method: 'POST',
                headers: authHeader, // Send auth token
                body: formData,
            });
            const fbResult = await fbResponse.json();

            if (!fbResponse.ok) {
                finalResults.push({ platform: 'facebook', status: 'error', message: fbResult.error || 'Upload failed' });
            } else {
                finalResults.push({ platform: 'facebook', status: 'success', url: fbResult.fb_url });
            }
            setUploadResults(finalResults);
        }

        // --- YouTube Upload ---
        if (youtubeChannel) {
            setUploadProgress(50);
            setUploadStatus('Uploading to YouTube Shorts...');
             const ytResponse = await fetch('/api/upload/youtube', {
                method: 'POST',
                headers: authHeader, // Send auth token
                body: formData, // FormData can be reused
            });
            const ytResult = await ytResponse.json();
            if (!ytResponse.ok) {
                finalResults.push({ platform: 'youtube', status: 'error', message: ytResult.error || 'Upload failed' });
            } else {
                finalResults.push({ platform: 'youtube', status: 'success', url: ytResult.yt_url });
            }
            setUploadResults(finalResults);
        }

        setUploadProgress(100);
        setUploadStatus('All uploads processed!');

    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      setUploadStatus('Upload failed: ' + message);
      setIsUploading(false); // Also stop loading on failure
    } finally {
        // This setTimeout only resets the form, not the results.
        setTimeout(() => {
            setIsUploading(false);
            setVideoFile(null);
            setThumbnailFile(null);
            setDescription('');
            setShopeeLink('');
            setLazadaLink('');
            setUseShopeeLink(false);
            setUseLazadaLink(false);
            setSchedulePost(false);
            setPublishAt('');
            setThumbnailPreview(null);
            setUploadProgress(0);
            setUploadStatus('');
        }, 5000);
    }
  };

  // By applying a class that hides the component until it's mounted on the client,
  // we ensure the server-rendered HTML is present but invisible, preventing a hydration mismatch
  // and hiding the flash of default state.
  return (
    <div className={isMounted ? 'fade-in' : 'hide-until-mounted'}>
      <div className="glass-container">
        {/* Platform Status - Always at top */}
        <div className="status-bar">
          <div className={`platform-status-container facebook-status ${facebookPage ? 'status-online' : 'status-offline'}`}>
            <span className="platform-name">REELS</span>
            {!facebookPage && <button onClick={handleFacebookConnect} className="connect-link">Connect</button>}
          </div>
          <div className="status-divider"></div>
          <div className={`platform-status-container youtube-status ${youtubeChannel ? 'status-online' : 'status-offline'}`}>
            <span className="platform-name">SHORTS</span>
            {!youtubeChannel && <button onClick={handleYouTubeLogin} className="connect-link">Connect</button>}
          </div>
        </div>
        {/* Upload Results - Above Form */}
        {uploadResults.length > 0 && (
          <div className="upload-results-top">
            <div className="results-body">
              {uploadResults.map((result, index) => (
                <div key={index} className={`platform-row ${result.status === 'success' ? (result.platform === 'facebook' ? 'facebook-row' : 'youtube-row') : 'error-row'}`}>
                  <div className="platform-info">
                    <div className={`platform-icon-large ${result.platform === 'facebook' ? 'facebook-icon-large' : 'youtube-icon-large'}`}>
                      {result.platform === 'facebook' ? '📘' : '📺'}
                    </div>
                    <div className="platform-details">
                      <div className="platform-name-large">
                        {result.platform === 'facebook' ? 'Facebook Reels' : 'YouTube Shorts'}
                      </div>
                      <div className="platform-description" style={{ color: result.status === 'success' ? 'var(--text-secondary)' : 'var(--error)' }}>
                        {result.status === 'success' 
                          ? `Your video is now live on ${result.platform === 'facebook' ? 'Facebook Reels' : 'YouTube Shorts'}`
                          : result.message
                        }
                      </div>
                    </div>
                  </div>
                  {result.status === 'success' ? (
                    <>
                      <div className="platform-status-large">
                        <div className="status-icon">✅</div>
                        <div>Success</div>
                      </div>
                      <div className="link-section">
                        <a href={result.url} target="_blank" rel="noopener noreferrer" className="view-link">
                          🔗 View
                        </a>
                        <button 
                          className="copy-button-large" 
                          onClick={(e) => copyToClipboard(result.url!, e.currentTarget)}
                        >
                          📋 Copy Link
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="platform-status-large status-failed">
                      <div className="status-icon">❌</div>
                      <div>Failed</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <form id="uploadForm" className="form-container" method="POST" encType="multipart/form-data" onSubmit={handleFormSubmit}>
            <div 
              className={`image-preview-section ${isDragging ? 'dragging' : ''}`}
              onDragOver={(e) => handleDragEvents(e, true)}
              onDragLeave={(e) => handleDragEvents(e, false)}
              onDrop={(e) => handleDrop(e, 'thumbnail')}
            >
                <div id="image-drop-zone" onClick={() => document.getElementById('thumbnail_file')?.click()}>
                    {thumbnailPreview ? (
                        <Image id="thumbnail-preview" src={thumbnailPreview} alt="Thumbnail Preview" fill style={{objectFit: 'cover' }}/>
                    ) : (
                        youtubeChannel ? (
                          <div className="channel-placeholder">
                            <Image src={youtubeChannel.pfp} alt={youtubeChannel.name} className="logo-image-center" width={120} height={120}/>
                            <p className="channel-name">{youtubeChannel.name}</p>
                            <p className="channel-prompt">อัปโหลดภาพปกสำหรับวิดีโอนี้</p>
                          </div>
                        ) : (
                          <div className="disconnected-placeholder">
                            <div className="disconnected-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
                            </div>
                            <p className="disconnected-text">Not Connected to YouTube</p>
                            <p className="disconnected-subtext">Connect YouTube to see your channel</p>
                          </div>
                        )
                    )}
                </div>
                <input type="file" name="thumbnail_file" id="thumbnail_file" accept="image/jpeg,image/png" style={{display: "none"}} onChange={(e) => handleFileChange(e, 'thumbnail')} />
            </div>

            <div className="form-section">
                <div className="form-group">
                    <label htmlFor="video_file" className="form-label">Select Video File (MP4)</label>
                    <div 
                      id="video-drop-zone" 
                      className={`file-drop-zone ${isDragging ? 'dragging' : ''}`}
                      onDragOver={(e) => handleDragEvents(e, true)}
                      onDragLeave={(e) => handleDragEvents(e, false)}
                      onDrop={(e) => handleDrop(e, 'video')}
                      onClick={() => document.getElementById('video_file')?.click()}
                      style={{ cursor: 'pointer' }}
                    >
                        <span id="video-file-name">{videoFile ? truncateFileName(videoFile.name) : 'Choose File | No file chosen'}</span>
                    </div>
                    <input type="file" name="video_file" id="video_file" required accept="video/mp4,video/quicktime" style={{display: "none"}} onChange={(e) => handleFileChange(e, 'video')} />
                </div>

                <div className="form-group">
                    <label htmlFor="description" className="form-label">Title / Description</label>
                    <textarea 
                        id="description" 
                        name="description" 
                        className="form-input" 
                        rows={5} 
                        placeholder="Enter your video description..."
                        value={description}
                        onChange={handleDescriptionChange}
                    ></textarea>
                    <div id="char-counter" className="char-counter">{description.length}/2200</div>
                </div>

                <div className="form-group">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <input 
                            type="checkbox" 
                            id="use-shopee"
                            checked={useShopeeLink}
                            onChange={(e) => setUseShopeeLink(e.target.checked)}
                            style={{ width: '18px', height: '18px' }}
                        />
                        <label htmlFor="use-shopee" className="form-label" style={{ margin: 0 }}>🛒 Shopee Link</label>
                    </div>
                    <input 
                        type="url" 
                        className="form-input" 
                        placeholder="https://shopee.co.th/..."
                        value={shopeeLink}
                        onChange={(e) => setShopeeLink(e.target.value)}
                        disabled={!useShopeeLink}
                        style={{ 
                            minHeight: '44px',
                            opacity: useShopeeLink ? 1 : 0.5,
                            cursor: useShopeeLink ? 'text' : 'not-allowed'
                        }}
                    />
                </div>

                <div className="form-group">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <input 
                            type="checkbox" 
                            id="use-lazada"
                            checked={useLazadaLink}
                            onChange={(e) => setUseLazadaLink(e.target.checked)}
                            style={{ width: '18px', height: '18px' }}
                        />
                        <label htmlFor="use-lazada" className="form-label" style={{ margin: 0 }}>🛍️ Lazada Link</label>
                    </div>
                    <input 
                        type="url" 
                        className="form-input" 
                        placeholder="https://www.lazada.co.th/..."
                        value={lazadaLink}
                        onChange={(e) => setLazadaLink(e.target.value)}
                        disabled={!useLazadaLink}
                        style={{ 
                            minHeight: '44px',
                            opacity: useLazadaLink ? 1 : 0.5,
                            cursor: useLazadaLink ? 'text' : 'not-allowed'
                        }}
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Auto Hashtags</label>
                    <div className="auto-hashtags">
                        <p><strong>For Reels:</strong> #เล่าเรื่อง #คลิปไวรัล #reels #viralvideo</p>
                        <p><strong>For Shorts:</strong> #เล่าเรื่อง #คลิปไวรัล #viralvideo #shorts</p>
                    </div>
                </div>

                <div className="form-group schedule-group">
                    <label className="form-label">Schedule Post</label>
                    <div className="schedule-toggle-wrapper">
                         <input 
                            type="checkbox" 
                            id="schedule_post" 
                            name="schedule_post"
                            checked={schedulePost}
                            onChange={handleScheduleToggle}
                         />
                         <label htmlFor="schedule_post" className="toggle-switch"></label>
                         {schedulePost && (
                           <input 
                                type="datetime-local" 
                                id="publish_at" 
                                name="publish_at" 
                                className="form-input" 
                                value={publishAt}
                                onChange={handlePublishAtChange}
                                min={minScheduleTime}
                                style={{ minHeight: 'auto' }}
                            />
                         )}
                    </div>
                </div>

                <button type="submit" id="uploadButton" className="btn btn-primary" disabled={isUploading}>
                    {isUploading ? (
                      <>
                        <div className="loading"></div>
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-rocket"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>
                        <span>🚀 Launch to All Platforms</span>
                      </>
                    )}
                </button>
            </div>
        </form>

        {/* Progress Container - Moved back outside the form */}
        {(isUploading || uploadStatus) && (
          <div id="progress-container" className="progress-container-inline">
              <div className="progress-bar-wrapper">
                  <div id="progress-bar" className="progress-bar" style={{width: `${uploadProgress}%`}}></div>
              </div>
              <div id="progress-text" className="progress-text">{uploadStatus}</div>
              <div id="status-log" className="status-log"></div>
          </div>
        )}
      </div>
    </div>
  );
} 