// ============================================
// 1. THUMB PREVIEW
// ============================================
const thumbPreviewPopup = document.getElementById("thumbPreviewPopup");
window.showThumbPreview = function (src, e) {
    thumbPreviewPopup.src = src;
    thumbPreviewPopup.style.display = "block";
    window.moveThumbPreview(e);
};
window.moveThumbPreview = function (e) {
    const x = e.clientX + 20;
    const y = e.clientY - 100;
    thumbPreviewPopup.style.left = x + "px";
    thumbPreviewPopup.style.top = Math.max(10, y) + "px";
};
window.hideThumbPreview = function () {
    thumbPreviewPopup.style.display = "none";
};

// ============================================
