import { useState, useEffect, useRef } from "react";
import { useUserPreferences } from "../context/UserPreferencesContext";
import AvatarCropper from "./AvatarCropper";

interface AvatarUploadModalProps {
  file: File | null;
  onClose: () => void;
  onConfirm: (file: File, cropData: { x: number; y: number; zoom: number }) => void;
  isUploading: boolean;
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

      // Create circular clip path
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      const imgWidth = img.naturalWidth;
      const imgHeight = img.naturalHeight;
      
      // The cropper UI shows image in a 320x320 container
      // The canvas is 512x512
      const uiSize = 320;
      const scale = cropData.zoom;
      
      // Scale factor from UI to canvas
      const outputScale = size / uiSize;
      
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
    onClose();
  }

  if (!file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">{t("core.avatar.title")}</h2>

        <p className="mb-4 text-sm text-gray-600 text-center">{t("core.avatar.hint")}</p>

        {/* Interactive Cropper */}
        <div className="mb-6">
          {previewUrl ? (
            <AvatarCropper imageUrl={previewUrl} onCropChange={setCropData} />
          ) : (
            <div className="flex h-64 items-center justify-center text-gray-400">
              <span className="text-sm">{t("core.avatar.uploading")}</span>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleClose}
            disabled={isUploading || isProcessing}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isUploading || !previewUrl || isProcessing}
            className="flex-1 rounded-lg bg-[#372579] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2a1c5e] disabled:opacity-60"
          >
            {isProcessing
              ? t("core.avatar.processing")
              : isUploading
                ? t("core.avatar.uploading")
                : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
