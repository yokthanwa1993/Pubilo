// 6. AUTO-POST
// ============================================
const postModeImage = document.getElementById("postModeImage");
const postModeText = document.getElementById("postModeText");
const postModeAlternate = document.getElementById("postModeAlternate");
const pageTokenInputPanel = document.getElementById("pageTokenInputPanel");
let currentPostMode = "image";

// Auto-Hide elements
const autoHideEnabled = document.getElementById("autoHideEnabled");
const autoHideTokenInput = document.getElementById("autoHideTokenInput");
const autoHideTokenGroup = document.getElementById("autoHideTokenGroup");
const hideSharedStory = document.getElementById("hideSharedStory");
const hideMobileStatus = document.getElementById("hideMobileStatus");
const hideAddedPhotos = document.getElementById("hideAddedPhotos");

// Auto-resize textarea function
function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

// Add auto-resize listeners
[linkPromptInput, imagePromptInput, newsAnalysisPromptInput, newsGenerationPromptInput].forEach(textarea => {
    if (textarea) {
        textarea.addEventListener('input', () => autoResizeTextarea(textarea));
    }
});

// Helper functions for radio buttons
function getLinkImageSize() {
    const checked = document.querySelector('input[name="linkImageSize"]:checked');
    return checked ? checked.value : "1:1";
}
function setLinkImageSize(value) {
    const radio = document.querySelector(`input[name="linkImageSize"][value="${value}"]`);
    if (radio) radio.checked = true;
}
function getImageImageSize() {
    const checked = document.querySelector('input[name="imageImageSize"]:checked');
    return checked ? checked.value : "1:1";
}
function setImageImageSize(value) {
    const radio = document.querySelector(`input[name="imageImageSize"][value="${value}"]`);
    if (radio) radio.checked = true;
}
function getNewsImageSize() {
    const checked = document.querySelector('input[name="newsImageSize"]:checked');
    return checked ? checked.value : "1:1";
}
function setNewsImageSize(value) {
    const radio = document.querySelector(`input[name="newsImageSize"][value="${value}"]`);
    if (radio) radio.checked = true;
}

// Auto-Post Alternating Functions
function formatAutoPostTime(isoString) {
    if (!isoString) return "-";
    const date = new Date(isoString);
    return date.toLocaleString('th-TH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getNextPostType(lastType) {
    if (!lastType) return "Text";
    return lastType === "text" ? "Image" : "Text";
}

function setAutoPostMode(mode) {
    currentPostMode = mode;
    [postModeImage, postModeText, postModeAlternate].forEach(btn => {
        if (btn) btn.classList.remove('active');
    });
    if (mode === 'image' && postModeImage) {
        postModeImage.classList.add('active');
    } else if (mode === 'text' && postModeText) {
        postModeText.classList.add('active');
    } else if (mode === 'alternate' && postModeAlternate) {
        postModeAlternate.classList.add('active');
    }
    
    // Show colorBg option only for text or alternate mode
    const colorBgGroup = document.getElementById("colorBgGroup");
    const colorBgPresetsGroup = document.getElementById("colorBgPresetsGroup");
    if (colorBgGroup) {
        colorBgGroup.style.display = (mode === 'text' || mode === 'alternate') ? 'flex' : 'none';
    }
    if (colorBgPresetsGroup) {
        const colorBgEnabled = document.getElementById("colorBgEnabled");
        colorBgPresetsGroup.style.display = ((mode === 'text' || mode === 'alternate') && colorBgEnabled?.checked) ? 'block' : 'none';
    }
    
    // Show share mode only for alternate mode
    if (shareModeGroup) {
        shareModeGroup.style.display = (mode === 'alternate' && shareEnabled?.checked && sharePageSelect?.value) ? 'block' : 'none';
    }
}

async function loadShareScheduleConflicts(targetPageId) {
    const currentPageId = getCurrentPageId();
    const shareScheduleMinutesGrid = document.getElementById("shareScheduleMinutesGrid");
    if (!shareScheduleMinutesGrid || !targetPageId) return;
    
    // Reset all to default
    shareScheduleMinutesGrid.querySelectorAll('.minute-checkbox').forEach(label => {
        label.classList.remove('used-by-others');
        label.style.removeProperty('--other-color');
        label.title = '';
        const cb = label.querySelector('input');
        if (cb) cb.disabled = false;
    });
    
    try {
        const res = await fetch(`/api/auto-post-config?targetPageId=${targetPageId}`);
        const data = await res.json();
        
        // Get current page color
        const pageColorPicker = document.getElementById("pageColorPicker");
        const currentPageColor = pageColorPicker?.value || '#1a1a1a';
        const currentPageName = document.querySelector('.page-selector-name')?.textContent || 'เพจนี้';
        
        if (data.success && data.configs) {
            const usedMinutes = {};
            data.configs.forEach(config => {
                if (config.page_id === currentPageId) return;
                const mins = (config.share_schedule_minutes || '').split(',').map(m => m.trim()).filter(m => m);
                const color = config.page_color || '#f59e0b';
                const name = config.page_name || config.page_id.slice(-6);
                mins.forEach(m => {
                    if (!usedMinutes[m]) usedMinutes[m] = [];
                    usedMinutes[m].push({ color, name });
                });
            });
            
            // Update legend with page names
            const legendContainer = document.getElementById("shareLegend");
            if (legendContainer) {
                let legendHtml = `<span><span style="display: inline-block; width: 12px; height: 12px; background: ${currentPageColor}; border-radius: 2px; vertical-align: middle;"></span> ${currentPageName}</span>`;
                const seenPages = new Map();
                data.configs.forEach(config => {
                    if (config.page_id === currentPageId) return;
                    if (seenPages.has(config.page_id)) return;
                    seenPages.set(config.page_id, true);
                    const color = config.page_color || '#f59e0b';
                    const name = config.page_name || config.page_id.slice(-6);
                    legendHtml += `<span><span style="display: inline-block; width: 12px; height: 12px; background: ${color}; border-radius: 2px; vertical-align: middle;"></span> ${name}</span>`;
                });
                legendContainer.innerHTML = legendHtml;
            }
            
            shareScheduleMinutesGrid.querySelectorAll('input').forEach(cb => {
                const label = cb.closest('.minute-checkbox');
                if (usedMinutes[cb.value]) {
                    const infos = usedMinutes[cb.value];
                    label.classList.add('used-by-others');
                    label.style.setProperty('--other-color', infos[0].color);
                    label.title = `ใช้โดย: ${infos.map(i => i.name).join(', ')}`;
                    if (!cb.checked) {
                        cb.disabled = true;
                    }
                }
            });
        }
    } catch (err) {
        console.error('[Share] Failed to load conflicts:', err);
    }
    
    // Update next share time display
    updateNextShareDisplay();
}

function updateNextShareDisplay() {
    const shareScheduleMinutesGrid = document.getElementById("shareScheduleMinutesGrid");
    const nextShareInfo = document.getElementById("nextShareInfo");
    const nextShareDisplay = document.getElementById("nextShareDisplay");
    if (!shareScheduleMinutesGrid || !nextShareInfo || !nextShareDisplay) return;
    
    const checked = shareScheduleMinutesGrid.querySelectorAll('input:checked');
    if (checked.length === 0) {
        nextShareInfo.style.display = 'none';
        return;
    }
    
    const mins = Array.from(checked).map(cb => parseInt(cb.value)).sort((a,b) => a-b);
    const now = new Date();
    const currentMin = now.getMinutes();
    const currentHour = now.getHours();
    
    let nextMin = mins.find(m => m > currentMin);
    let nextHour = currentHour;
    if (nextMin === undefined) {
        nextMin = mins[0];
        nextHour = currentHour + 1;
    }
    
    const nextTime = new Date(now);
    nextTime.setHours(nextHour, nextMin, 0, 0);
    
    nextShareInfo.style.display = 'block';
    nextShareDisplay.textContent = nextTime.toLocaleString('th-TH');
}

// Share to Page elements (defined early for use in loadAutoPostConfig)
const shareEnabled = document.getElementById("shareEnabled");
const sharePageGroup = document.getElementById("sharePageGroup");
const sharePageSelect = document.getElementById("sharePageSelect");
const shareModeGroup = document.getElementById("shareModeGroup");
const shareImage = document.getElementById("shareImage");
const shareText = document.getElementById("shareText");

function getShareMode() {
    const img = shareImage?.checked;
    const txt = shareText?.checked;
    if (img && txt) return 'both';
    if (img) return 'image';
    if (txt) return 'text';
    return 'none';
}

function setShareMode(mode) {
    if (shareImage) shareImage.checked = mode === 'both' || mode === 'image';
    if (shareText) shareText.checked = mode === 'both' || mode === 'text';
}

async function loadAutoPostConfig() {
    const pageId = getCurrentPageId();
    if (!pageId) return;

    const colorBgEnabled = document.getElementById("colorBgEnabled");
    const colorBgPresetsGroup = document.getElementById("colorBgPresetsGroup");

    try {
        const response = await fetch(`/api/page-settings?pageId=${pageId}`);
        const data = await response.json();
        if (data.success && data.settings) {
            const config = data.settings;
            const mode = config.post_mode;
            setAutoPostMode(mode);
            if (colorBgEnabled) colorBgEnabled.checked = config.color_bg || false;
            
            // Load presets
            currentPresets = (config.color_bg_presets || '').split(',').filter(s => s.trim());
            renderPresets();
            
            if (colorBgPresetsGroup) {
                colorBgPresetsGroup.style.display = ((mode === 'text' || mode === 'alternate') && config.color_bg) ? 'block' : 'none';
            }
            
            // Load share settings
            populateSharePageDropdown();
            if (config.share_page_id) {
                shareEnabled.checked = true;
                sharePageGroup.style.display = "block";
                sharePageSelect.value = config.share_page_id;
                const shareScheduleGroup = document.getElementById("shareScheduleGroup");
                if (shareScheduleGroup) shareScheduleGroup.style.display = "block";
                const shareScheduleMinutesGrid = document.getElementById("shareScheduleMinutesGrid");
                if (shareScheduleMinutesGrid) {
                    const shareMins = (config.share_schedule_minutes || '').split(',').map(s => s.trim()).filter(s => s);
                    shareScheduleMinutesGrid.querySelectorAll('input').forEach(cb => {
                        cb.checked = shareMins.includes(cb.value);
                    });
                }
                await loadShareScheduleConflicts(config.share_page_id);
                const shareModeGroup = document.getElementById("shareModeGroup");
                if (shareModeGroup) {
                    shareModeGroup.style.display = (mode === 'alternate') ? "block" : "none";
                }
                setShareMode(config.share_mode || 'both');
            } else {
                shareEnabled.checked = false;
                sharePageGroup.style.display = "none";
            }
            const pageColorPicker = document.getElementById("pageColorPicker");
            if (pageColorPicker && config.page_color) {
                pageColorPicker.value = config.page_color;
            }
            const shareScheduleMinutesGrid = document.getElementById("shareScheduleMinutesGrid");
            if (shareScheduleMinutesGrid && config.page_color) {
                shareScheduleMinutesGrid.style.setProperty('--page-color', config.page_color);
            }
        }
    } catch (err) {
        console.error("[Auto-Post] Failed to load config:", err);
    }
}

async function saveAutoPostConfig(mode, colorBg, sharePageId, colorBgPresets, shareMode, shareScheduleMinutes, pageColor) {
    const pageId = getCurrentPageId();
    if (!pageId) return;

    const pageName = document.querySelector('.page-selector-name')?.textContent || null;

    const body = { pageId };
    if (mode !== undefined) body.postMode = mode;
    if (colorBg !== undefined) body.colorBg = colorBg;
    if (sharePageId !== undefined) body.sharePageId = sharePageId;
    if (colorBgPresets !== undefined) body.colorBgPresets = colorBgPresets;
    if (shareMode !== undefined) body.shareMode = shareMode;
    if (shareScheduleMinutes !== undefined) body.shareScheduleMinutes = shareScheduleMinutes;
    if (pageColor !== undefined) body.pageColor = pageColor;
    if (pageName) body.pageName = pageName;

    try {
        const response = await fetch('/api/page-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (data.success) {
            console.log("[Auto-Post] Config saved:", data.settings);
            if (mode !== undefined) setAutoPostMode(mode);
        } else {
            console.error("[Auto-Post] Failed to save config:", data.error);
        }
    } catch (err) {
        console.error("[Auto-Post] Failed to save config:", err);
    }
}

// Auto-Hide Functions
async function loadAutoHideConfig() {
    const pageId = getCurrentPageId();
    if (!pageId) return;

    try {
        const response = await fetch(`/api/auto-hide-config?pageId=${pageId}`);
        const data = await response.json();
        if (data.success && data.config) {
            autoHideEnabled.checked = data.config.enabled || false;
            // Hide token group (token is now in page_settings only)
            if (autoHideTokenGroup) {
                autoHideTokenGroup.style.display = "none";
            }
            // Load hide types
            const types = (data.config.hide_types || 'shared_story,mobile_status_update,added_photos').split(',');
            if (hideSharedStory) hideSharedStory.checked = types.includes('shared_story');
            if (hideMobileStatus) hideMobileStatus.checked = types.includes('mobile_status_update');
            if (hideAddedPhotos) hideAddedPhotos.checked = types.includes('added_photos');
        }
    } catch (err) {
        console.error("[Auto-Hide] Failed to load config:", err);
    }
}

function getHideTypes() {
    const types = [];
    if (hideSharedStory?.checked) types.push('shared_story');
    if (hideMobileStatus?.checked) types.push('mobile_status_update');
    if (hideAddedPhotos?.checked) types.push('added_photos');
    return types.join(',');
}

async function saveAutoHideConfig() {
    const pageId = getCurrentPageId();
    if (!pageId) return;

    const enabled = autoHideEnabled.checked;
    const hideTypes = getHideTypes();

    // Show/hide token group (removed - token is now in page_settings only)
    if (autoHideTokenGroup) {
        autoHideTokenGroup.style.display = "none";
    }

    try {
        const response = await fetch('/api/auto-hide-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageId, enabled, hideTypes })
        });
        const data = await response.json();
        if (data.success) {
            console.log("[Auto-Hide] Config saved:", data.config);
        }
    } catch (err) {
        console.error("[Auto-Hide] Failed to save config:", err);
    }
}

// Auto-hide checkbox change handlers
autoHideEnabled.addEventListener("change", saveAutoHideConfig);
if (hideSharedStory) hideSharedStory.addEventListener("change", saveAutoHideConfig);
if (hideMobileStatus) hideMobileStatus.addEventListener("change", saveAutoHideConfig);
if (hideAddedPhotos) hideAddedPhotos.addEventListener("change", saveAutoHideConfig);

// Post mode button handlers - toggle on/off
postModeImage.addEventListener("click", () => {
    const newMode = currentPostMode === 'image' ? null : 'image';
    saveAutoPostConfig(newMode);
});
postModeText.addEventListener("click", () => {
    const newMode = currentPostMode === 'text' ? null : 'text';
    saveAutoPostConfig(newMode);
});
postModeAlternate.addEventListener("click", () => {
    const newMode = currentPostMode === 'alternate' ? null : 'alternate';
    saveAutoPostConfig(newMode);
});

// Page color picker handler
const pageColorPicker = document.getElementById("pageColorPicker");
if (pageColorPicker) {
    pageColorPicker.addEventListener("change", (e) => {
        const color = e.target.value;
        // Update CSS variable
        const shareScheduleMinutesGrid = document.getElementById("shareScheduleMinutesGrid");
        if (shareScheduleMinutesGrid) {
            shareScheduleMinutesGrid.style.setProperty('--page-color', color);
        }
        saveAutoPostConfig(undefined, undefined, undefined, undefined, undefined, undefined, color);
    });
}

// Color Background checkbox handler
const colorBgPresetsGroup = document.getElementById("colorBgPresetsGroup");
const presetsList = document.getElementById("presetsList");
const newPresetInput = document.getElementById("newPresetInput");
const addPresetBtn = document.getElementById("addPresetBtn");
let currentPresets = [];

function renderPresets() {
    presetsList.innerHTML = currentPresets.map((p, i) => 
        `<span style="display: inline-flex; align-items: center; gap: 0.25rem; background: #e5e7eb; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">
            ${p}
            <button type="button" data-index="${i}" class="remove-preset-btn" style="background: none; border: none; cursor: pointer; color: #666; font-size: 1rem; line-height: 1;">×</button>
        </span>`
    ).join('');
    
    // Add event listeners
    presetsList.querySelectorAll('.remove-preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            currentPresets.splice(index, 1);
            renderPresets();
            saveAutoPostConfig(undefined, undefined, undefined, currentPresets.join(','));
        });
    });
}

addPresetBtn.addEventListener("click", () => {
    const val = newPresetInput.value.trim();
    if (val) {
        currentPresets.push(val);
        newPresetInput.value = '';
        renderPresets();
        saveAutoPostConfig(undefined, undefined, undefined, currentPresets.join(','));
    }
});

document.getElementById("colorBgEnabled").addEventListener("change", (e) => {
    colorBgPresetsGroup.style.display = e.target.checked ? "block" : "none";
    saveAutoPostConfig(undefined, e.target.checked);
});

function updateShareModeVisibility() {
    if (shareModeGroup) {
        shareModeGroup.style.display = (currentPostMode === 'alternate' && shareEnabled.checked && sharePageSelect.value) ? 'block' : 'none';
    }
}

shareEnabled.addEventListener("change", (e) => {
    sharePageGroup.style.display = e.target.checked ? "block" : "none";
    updateShareModeVisibility();
    saveAutoPostConfig(undefined, undefined, e.target.checked ? sharePageSelect.value : null);
});

sharePageSelect.addEventListener("change", async (e) => {
    updateShareModeVisibility();
    const targetPageId = e.target.value;
    
    // Show share schedule group when page selected
    const shareScheduleGroup = document.getElementById("shareScheduleGroup");
    if (shareScheduleGroup) {
        shareScheduleGroup.style.display = targetPageId ? "block" : "none";
    }
    
    // Load other pages' share schedules to show conflicts
    if (targetPageId) {
        await loadShareScheduleConflicts(targetPageId);
    }
    
    if (shareEnabled.checked) {
        saveAutoPostConfig(undefined, undefined, targetPageId || null);
    }
});

// Share mode checkbox handlers
if (shareImage) shareImage.addEventListener('change', () => saveAutoPostConfig(undefined, undefined, undefined, undefined, getShareMode()));
if (shareText) shareText.addEventListener('change', () => saveAutoPostConfig(undefined, undefined, undefined, undefined, getShareMode()));

// Share schedule minutes grid handler
const shareScheduleMinutesGrid = document.getElementById("shareScheduleMinutesGrid");
if (shareScheduleMinutesGrid) {
    shareScheduleMinutesGrid.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            const selected = [];
            shareScheduleMinutesGrid.querySelectorAll('input:checked:not(:disabled)').forEach(c => selected.push(c.value));
            console.log('[Share] Saving schedule:', selected.join(', '));
            saveAutoPostConfig(undefined, undefined, undefined, undefined, undefined, selected.join(', '));
        }
    });
}

// Populate share page dropdown
function populateSharePageDropdown() {
    const currentPageId = getCurrentPageId();
    sharePageSelect.innerHTML = '<option value="">-- เลือกเพจที่จะแชร์ไป --</option>';
    allPages.forEach(page => {
        if (page.id !== currentPageId) {
            const option = document.createElement("option");
            option.value = page.id;
            option.textContent = page.name;
            sharePageSelect.appendChild(option);
        }
    });
}

// Load settings into the panel
async function loadSettingsPanel() {
    const pageId = getCurrentPageId();
    if (!pageId) {
        console.log("[Settings Panel] No page selected");
        return;
    }

    // Try to load from cache first, otherwise fetch from API
    let settings = null;
    // Always fetch fresh from API for settings panel
    try {
        const response = await fetch(`/api/page-settings?pageId=${pageId}`);
        const data = await response.json();
        if (data.success && data.settings) {
            settings = {
                pageId,
                autoSchedule: data.settings.auto_schedule,
                scheduleMinutes: data.settings.schedule_minutes,
                postToken: data.settings.post_token,
                aiModel: data.settings.ai_model,
                aiResolution: data.settings.ai_resolution,
                linkImageSize: data.settings.link_image_size,
                imageImageSize: data.settings.image_image_size,
                newsAnalysisPrompt: data.settings.news_analysis_prompt,
                newsGenerationPrompt: data.settings.news_generation_prompt,
                newsImageSize: data.settings.news_image_size,
                newsVariationCount: data.settings.news_variation_count,
                imageSource: data.settings.image_source,
                ogBackgroundUrl: data.settings.og_background_url,
                ogFont: data.settings.og_font
            };
            // Update cache
            cachedPageSettings = settings;
            console.log("[Settings Panel] Loaded from API:", settings);
        }
    } catch (err) {
        console.error("[Settings Panel] Failed to load settings:", err);
    }

    // Apply settings to panel (postToken is NEVER loaded - user must enter manually)
    if (settings) {
        autoScheduleEnabledPanel.checked = settings.autoSchedule || false;
        scheduleMinutesPanel.value = settings.scheduleMinutes || "00, 15, 30, 45";
        if (workingHoursStart) workingHoursStart.value = settings.workingHoursStart ?? 6;
        if (workingHoursEnd) workingHoursEnd.value = settings.workingHoursEnd ?? 24;
        imageSourceSelectPanel.value = settings.imageSource || "ai";
        ogBackgroundUrlPanel.value = settings.ogBackgroundUrl || "";
        ogFontSelectPanel.value = settings.ogFont || "noto-sans-thai";
    } else {
        autoScheduleEnabledPanel.checked = false;
        scheduleMinutesPanel.value = "00, 15, 30, 45";
        if (workingHoursStart) workingHoursStart.value = 6;
        if (workingHoursEnd) workingHoursEnd.value = 24;
        imageSourceSelectPanel.value = "ai";
        ogBackgroundUrlPanel.value = "";
        ogFontSelectPanel.value = "noto-sans-thai";
    }
    // Page Token input - always start empty, user enters manually
    if (pageTokenInputPanel) pageTokenInputPanel.value = "";
    // Sync minute grid with hidden input
    if (scheduleMinutesGridPanel) syncInputToMinuteGrid(scheduleMinutesPanel, scheduleMinutesGridPanel);

    // Update visibility
    const enabled = autoScheduleEnabledPanel.checked;
    const isOg = imageSourceSelectPanel.value === "og";
    scheduleIntervalGroupPanel.style.display = enabled ? "block" : "none";
    workingHoursGroupPanel.style.display = enabled ? "block" : "none";
    nextScheduleInfoPanel.style.display = enabled ? "block" : "none";
    imageSourceGroupPanel.style.display = enabled ? "block" : "none";
    ogBackgroundGroupPanel.style.display = (enabled && isOg) ? "block" : "none";
    ogFontGroupPanel.style.display = (enabled && isOg) ? "block" : "none";
    if (enabled) {
        nextScheduleDisplayPanel.textContent = calculateNextScheduleForPanel();
    }

    // Load AI prompts from database
    try {
        const promptsRes = await fetch(`/api/prompts?pageId=${pageId}`);
        const promptsData = await promptsRes.json();
        if (promptsData.success && promptsData.prompts.length > 0) {
            const linkPrompt = promptsData.prompts.find(p => p.prompt_type === 'link_post');
            const imagePrompt = promptsData.prompts.find(p => p.prompt_type === 'image_post');
            linkPromptInput.value = linkPrompt?.prompt_text || "";
            imagePromptInput.value = imagePrompt?.prompt_text || "";
        } else {
            // Try loading default prompts
            const defaultRes = await fetch(`/api/prompts?pageId=_default`);
            const defaultData = await defaultRes.json();
            if (defaultData.success && defaultData.prompts.length > 0) {
                const defaultLinkPrompt = defaultData.prompts.find(p => p.prompt_type === 'link_post');
                const defaultImagePrompt = defaultData.prompts.find(p => p.prompt_type === 'image_post');
                linkPromptInput.value = defaultLinkPrompt?.prompt_text || "";
                imagePromptInput.value = defaultImagePrompt?.prompt_text || "";
            }
        }
    } catch (e) {
        console.error('[Settings] Failed to load prompts from DB:', e);
    }

    // Load image sizes from database
    const savedLinkImageSize = settings?.linkImageSize || settings?.link_image_size || "1:1";
    const savedImageImageSize = settings?.imageImageSize || settings?.image_image_size || "1:1";
    const savedNewsImageSize = settings?.newsImageSize || settings?.news_image_size || "1:1";
    setLinkImageSize(savedLinkImageSize);
    setImageImageSize(savedImageImageSize);
    setNewsImageSize(savedNewsImageSize);

    // Load news prompts
    if (newsAnalysisPromptInput) newsAnalysisPromptInput.value = settings?.newsAnalysisPrompt || "";
    if (newsGenerationPromptInput) newsGenerationPromptInput.value = settings?.newsGenerationPrompt || "";
    if (newsVariationCount) newsVariationCount.value = settings?.newsVariationCount || 4;

    // Auto-resize textareas after loading content
    autoResizeTextarea(linkPromptInput);
    autoResizeTextarea(imagePromptInput);
    if (newsAnalysisPromptInput) autoResizeTextarea(newsAnalysisPromptInput);
    if (newsGenerationPromptInput) autoResizeTextarea(newsGenerationPromptInput);

    // Load AI settings from database
    const savedAiModel = settings?.aiModel || settings?.ai_model || "gemini-2.0-flash-exp";
    const savedAiResolution = settings?.aiResolution || settings?.ai_resolution || "2K";
    aiModelSelect.value = savedAiModel;
    aiResolutionSelect.value = savedAiResolution;

    // Load Auto-Post Alternating config
    await loadAutoPostConfig();
    
    // Load Auto-Hide config
    await loadAutoHideConfig();
}

// Auto schedule checkbox change handler for panel
autoScheduleEnabledPanel.addEventListener("change", () => {
    const enabled = autoScheduleEnabledPanel.checked;
    const isOg = imageSourceSelectPanel.value === "og";
    scheduleIntervalGroupPanel.style.display = enabled ? "block" : "none";
    workingHoursGroupPanel.style.display = enabled ? "block" : "none";
    nextScheduleInfoPanel.style.display = enabled ? "block" : "none";
    imageSourceGroupPanel.style.display = enabled ? "block" : "none";
    ogBackgroundGroupPanel.style.display = (enabled && isOg) ? "block" : "none";
    ogFontGroupPanel.style.display = (enabled && isOg) ? "block" : "none";
    if (enabled) {
        nextScheduleDisplayPanel.textContent = calculateNextScheduleForPanel();
    }
});

// Image source change handler for panel
imageSourceSelectPanel.addEventListener("change", () => {
    const isOg = imageSourceSelectPanel.value === "og";
    const enabled = autoScheduleEnabledPanel.checked;
    ogBackgroundGroupPanel.style.display = (enabled && isOg) ? "block" : "none";
    ogFontGroupPanel.style.display = (enabled && isOg) ? "block" : "none";
});

// Schedule minutes change handler for panel
scheduleMinutesPanel.addEventListener("input", () => {
    if (autoScheduleEnabledPanel.checked) {
        nextScheduleDisplayPanel.textContent = calculateNextScheduleForPanel();
    }
});

// Save settings panel button handler
saveSettingsPanelBtn.addEventListener("click", async () => {
    const pageId = getCurrentPageId();
    if (!pageId) {
        alert("กรุณาเลือกเพจก่อน");
        return;
    }

    const autoSchedule = autoScheduleEnabledPanel.checked;
    const mins = scheduleMinutesPanel.value || "00, 15, 30, 45";
    // Use empty string "" when user clears (not null), so auto-sync won't overwrite
    const postToken = pageTokenInputPanel?.value?.trim() ?? "";
    const workingStart = parseInt(workingHoursStart.value) || 6;
    const workingEnd = parseInt(workingHoursEnd.value) || 24;
    const linkPrompt = linkPromptInput.value.trim();
    const imagePrompt = imagePromptInput.value.trim();
    const linkImageSize = getLinkImageSize();
    const imageImageSize = getImageImageSize();
    const newsImageSize = getNewsImageSize();
    const newsAnalysisPrompt = newsAnalysisPromptInput?.value?.trim() || "";
    const newsGenerationPrompt = newsGenerationPromptInput?.value?.trim() || "";
    const newsVarCount = parseInt(newsVariationCount?.value) || 4;
    const imageSource = imageSourceSelectPanel.value || "ai";
    const ogBgUrl = ogBackgroundUrlPanel.value || "";
    const ogFont = ogFontSelectPanel.value || "noto-sans-thai";

    // Update cache immediately
    cachedPageSettings = {
        pageId,
        autoSchedule,
        scheduleMinutes: mins,
        workingHoursStart: workingStart,
        workingHoursEnd: workingEnd,
        aiModel: aiModelSelect.value,
        aiResolution: aiResolutionSelect.value,
        linkImageSize,
        imageImageSize,
        newsImageSize,
        newsAnalysisPrompt,
        newsGenerationPrompt,
        newsVariationCount: newsVarCount,
        imageSource,
        ogBackgroundUrl: ogBgUrl,
        ogFont
    };

    // Also update the modal settings (keep in sync)
    autoScheduleEnabled.checked = autoSchedule;
    scheduleMinutes.value = mins;
    if (scheduleMinutesGrid) syncInputToMinuteGrid(scheduleMinutes, scheduleMinutesGrid);
    scheduleIntervalGroup.style.display = autoSchedule ? "block" : "none";
    nextScheduleInfo.style.display = autoSchedule ? "block" : "none";

    // Save to database via API
    try {
        // Save page settings to database
        const response = await fetch('/api/page-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pageId,
                autoSchedule,
                scheduleMinutes: mins,
                postToken,
                workingHoursStart: workingStart,
                workingHoursEnd: workingEnd,
                aiModel: aiModelSelect.value,
                aiResolution: aiResolutionSelect.value,
                linkImageSize,
                imageImageSize,
                newsImageSize,
                newsAnalysisPrompt,
                newsGenerationPrompt,
                newsVariationCount: newsVarCount,
                imageSource,
                ogBackgroundUrl: ogBgUrl,
                ogFont
            })
        });
        const data = await response.json();

        // Save prompts to database
        if (linkPrompt) {
            await fetch('/api/prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pageId,
                    promptType: 'link_post',
                    promptText: linkPrompt
                })
            });
        }
        if (imagePrompt) {
            await fetch('/api/prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pageId,
                    promptType: 'image_post',
                    promptText: imagePrompt
                })
            });
        }

        // Save Auto-Post Alternating config
        await saveAutoPostConfig();

        // Save Auto-Hide config
        await saveAutoHideConfig();

        if (data.success) {
            console.log("[FEWFEED] Settings and prompts saved to database");
            // Show success feedback
            saveSettingsPanelBtn.textContent = "บันทึกแล้ว ✓";
            saveSettingsPanelBtn.style.background = "#10b981";
            setTimeout(() => {
                saveSettingsPanelBtn.textContent = "บันทึกการตั้งค่า";
                saveSettingsPanelBtn.style.background = "";
            }, 2000);
        } else {
            console.error("[FEWFEED] Failed to save settings:", data.error);
            alert("บันทึกไม่สำเร็จ: " + data.error);
        }
    } catch (error) {
        console.error("[FEWFEED] API error:", error);
        alert("บันทึกไม่สำเร็จ กรุณาลองใหม่");
    }

    updatePublishButton();
});

// Load settings on page load
loadSettings();

// Nav elements
const dashboardNavItem =
    document.getElementById("dashboardNavItem");
const imageNavItem = document.getElementById("imageNavItem");
const textNavItem = document.getElementById("textNavItem");
const reelsNavItem = document.getElementById("reelsNavItem");
const pendingNavItem = document.getElementById("pendingNavItem");
const publishedNavItem = document.getElementById("publishedNavItem");
const quotesNavItem = document.getElementById("quotesNavItem");
const earningsNavItem = document.getElementById("earningsNavItem");
const pendingBadge = document.getElementById("pendingBadge");
const pendingPanel = document.getElementById("pendingPanel");
const publishedPanel = document.getElementById("publishedPanel");
const publishedTableContainer = document.getElementById("publishedTableContainer");
const quotesPanel = document.getElementById("quotesPanel");
const earningsPanel = document.getElementById("earningsPanel");
const settingsPanel = document.getElementById("settingsPanel");
const pendingTableContainer = document.getElementById(
    "pendingTableContainer",
);
const previewPanel = document.querySelector(".preview-panel");
const formPanel = document.querySelector(".form-panel");
const appLayout = document.querySelector(".app-layout");

// Sort state for pending posts (true = newest first, false = oldest/soonest first)
let sortNewestFirst = true;
const sortToggleBtn = document.getElementById("sortToggleBtn");

function updateSortButton() {
    const icon = sortToggleBtn.querySelector(".sort-icon");
    const label = sortToggleBtn.querySelector(".sort-label");
    if (sortNewestFirst) {
        icon.textContent = "↓";
        label.textContent = "ล่าสุดก่อน";
    } else {
        icon.textContent = "↑";
        label.textContent = "โพสต์เร็วๆนี้ก่อน";
    }
}

if (sortToggleBtn) {
    sortToggleBtn.addEventListener("click", () => {
        sortNewestFirst = !sortNewestFirst;
        updateSortButton();
        // Re-render with new sort order
        const pageId = getCurrentPageId();
        const cachedPosts = getCachedPosts(pageId);
        if (cachedPosts) {
            renderPendingPosts(cachedPosts);
        }
    });
}

// Link-only elements (hidden in Image mode)
const linkOnlyFields = document.getElementById("linkOnlyFields");
const cardButtonGroup = document.getElementById("cardButtonGroup");
const cardLinkInfo = document.getElementById("cardLinkInfo");

// Current post mode: 'link' or 'image'
let postMode = "link";

// State per mode - each mode has independent state
const modeState = {
    link: {
        referenceImages: [],
        generatedImages: [],
        selectedImage: null,
        currentView: "upload",
        lastCaption: "", // Store last used caption for regeneration
    },
    image: {
        referenceImages: [],
        generatedImages: [],
        selectedImage: null,
        currentView: "upload",
        lastCaption: "",
    },
    reels: {
        referenceImages: [],
        generatedImages: [],
        selectedImage: null,
        currentView: "upload",
        lastCaption: "",
    },
};

// Update pending count from Facebook API
async function updatePendingCount() {
    try {
        const scheduledPosts =
            await fetchScheduledPostsFromFacebook();
        const count = scheduledPosts.length;
        pendingBadge.textContent = count;
        pendingBadge.style.display = count > 0 ? "inline" : "none";
    } catch (err) {
        console.error("Failed to fetch pending count:", err);
    }
}

// ============================================
