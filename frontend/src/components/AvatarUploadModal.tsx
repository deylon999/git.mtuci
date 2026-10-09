import { useState, useEffect, useRef } from "react";
import { useUserPreferences } from "../context/UserPreferencesContext";
import AvatarCropper, { CROP_CIRCLE_RADIUS } from "./AvatarCropper";
import { useDialogA11y } from "../hooks/useDialogA11y";

interface AvatarUploadModalProps {
  file: File | null;
  onClose: () => void;
  onConfirm: (file: File, cropData: { x: number; y: number; zoom: number }) => void;
  isUploading: boolean;
  isDarkTheme?: boolean;
}

// Helper function to crop image using canvas
async function cropImageToBlob(
  imageUrl: string,
  cropData: { x: number; y: number; zoom: number },
  size: number = 512
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      // Square output, no circular clip: JPEG has no alpha, so clipped corners came out black.
      // Avatars are shown in a circle anyway. White under transparent PNGs for the same reason.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);

      const imgWidth = img.naturalWidth;
      const imgHeight = img.naturalHeight;
      const scale = cropData.zoom;

      // The canvas covers the cropper's circle guide, not the whole view around it.
      const outputScale = size / (CROP_CIRCLE_RADIUS * 2);

      // Calculate scaled dimensions (same as in cropper)
      const scaledWidth = imgWidth * scale * outputScale;
      const scaledHeight = imgHeight * scale * outputScale;

      // Convert UI offsets to canvas space
      const offsetX = cropData.x * outputScale;
      const offsetY = cropData.y * outputScale;

      // Calculate draw position (centered in canvas + offset)
      const drawX = (size - scaledWidth) / 2 + offsetX;
      const drawY = (size - scaledHeight) / 2 + offsetY;

      // Draw the image
      ctx.drawImage(img, drawX, drawY, scaledWidth, scaledHeight);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create blob from canvas"));
          }
        },
        "image/jpeg",
        0.9
      );
    };
    
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageUrl;
  });
}

export default function AvatarUploadModal({
  file,
  onClose,
  onConfirm,
  isUploading,
  isDarkTheme = false,
}: AvatarUploadModalProps) {
  const { t } = useUserPreferences();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropData, setCropData] = useState({ x: 0, y: 0, zoom: 1 });
  const [isProcessing, setIsProcessing] = useState(false);
  const fileRef = useRef<File | null>(file);

  useEffect(() => {
    fileRef.current = file;
  }, [file]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    return () => {
      reader.abort();
    };
  }, [file]);

  async function handleConfirm() {
    if (!file || !previewUrl) return;
    
    setIsProcessing(true);
    try {
      // Apply crop and get blob
      const croppedBlob = await cropImageToBlob(previewUrl, cropData, 512);
      
      // Create new File from blob
      const croppedFile = new File([croppedBlob], "avatar.jpg", { 
        type: "image/jpeg" 
      });
      
      onConfirm(croppedFile, cropData);
    } catch (err) {
      console.error("Failed to crop image:", err);
      // Fallback: upload original file
      onConfirm(file, cropData);
    } finally {
      setIsProcessing(false);
    }
  }

  function handleClose() {
    if (isUploading || isProcessing) return;
    onClose();
  }

  const panelRef = useDialogA11y(Boolean(file), handleClose, { busy: isUploading || isProcessing });

  if (!file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
      {/* p-4 on phones: the 320px crop area plus padding must fit a 375px screen. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-upload-title"
        className={`w-full max-w-md max-h-full overflow-y-auto rounded-xl p-4 shadow-xl sm:p-6 ${isDarkTheme ? "bg-[#1e1e1e]" : "bg-white"}`}>
        <h2 id="avatar-upload-title" className={`mb-4 text-xl font-semibold ${isDarkTheme ? "text-white" : "text-gray-900"}`}>{t("avatar.title")}</h2>

        <p className={`mb-4 text-sm text-center ${isDarkTheme ? "text-gray-400" : "text-gray-600"}`}>{t("avatar.hint")}</p>

        {/* Interactive Cropper */}
        <div className="mb-6">
          {previewUrl ? (
            <AvatarCropper imageUrl={previewUrl} onCropChange={setCropData} isDarkTheme={isDarkTheme} />
          ) : (
            <div className="flex h-64 items-center justify-center text-gray-400">
              <span className="text-sm">{t("avatar.uploading")}</span>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleClose}
            disabled={isUploading || isProcessing}
            className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${
              isDarkTheme
                ? "border-[#3d3d3d] bg-[#2d2d2d] text-gray-200 hover:bg-[#3d3d3d]"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isUploading || !previewUrl || isProcessing}
            className="flex-1 rounded-lg bg-[#372579] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2a1c5e] disabled:opacity-60"
          >
            {isProcessing
              ? t("avatar.processing")
              : isUploading
                ? t("avatar.uploading")
                : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
