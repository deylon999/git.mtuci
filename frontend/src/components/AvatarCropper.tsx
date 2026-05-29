import { useState, useRef, useEffect } from "react";
import { useUserPreferences } from "../context/UserPreferencesContext";

interface AvatarCropperProps {
  imageUrl: string;
  onCropChange?: (crop: { x: number; y: number; zoom: number }) => void;
  isDarkTheme?: boolean;
}

export default function AvatarCropper({ imageUrl, onCropChange, isDarkTheme = true }: AvatarCropperProps) {
  const { t } = useUserPreferences();
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Load image and calculate initial scale to fit in container
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const containerSize = 320;
      const imgWidth = img.naturalWidth;
      const imgHeight = img.naturalHeight;
      setImageSize({ width: imgWidth, height: imgHeight });
      
      // Calculate scale to fit entire image within container (like object-contain)
      const scaleX = containerSize / imgWidth;
      const scaleY = containerSize / imgHeight;
      const fitScale = Math.min(scaleX, scaleY);
      
      // Set initial zoom to fit the whole image
      setZoom(fitScale);
      setPosition({ x: 0, y: 0 });
    };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    onCropChange?.({ x: position.x, y: position.y, zoom });
  }, [position, zoom, onCropChange]);

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }

  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
  }

  // Clamp position to keep image within reasonable bounds
  function clampPosition(newX: number, newY: number, currentZoom: number) {
    const containerSize = 320;
    const scaledWidth = imageSize.width * currentZoom;
    const scaledHeight = imageSize.height * currentZoom;
    
    // Allow dragging until the image edge reaches the circle edge (128px from center)
    const circleRadius = 128; // The white circle radius
    
    // Max allowed offset: image edge should not go beyond opposite circle edge
    const maxX = Math.max(0, (scaledWidth / 2) - circleRadius);
    const maxY = Math.max(0, (scaledHeight / 2) - circleRadius);
    
    // Also allow some padding so user can position freely
    const padding = scaledWidth < containerSize || scaledHeight < containerSize ? 50 : 0;
    
    return {
      x: Math.max(-maxX - padding, Math.min(maxX + padding, newX)),
      y: Math.max(-maxY - padding, Math.min(maxY + padding, newY)),
    };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDragging) return;
    e.preventDefault();
    const rawX = e.clientX - dragStart.x;
    const rawY = e.clientY - dragStart.y;
    const clamped = clampPosition(rawX, rawY, zoom);
    setPosition(clamped);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isDragging) return;
    const touch = e.touches[0];
    const rawX = touch.clientX - dragStart.x;
    const rawY = touch.clientY - dragStart.y;
    const clamped = clampPosition(rawX, rawY, zoom);
    setPosition(clamped);
  }

  function handleEnd() {
    setIsDragging(false);
  }

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove as unknown as EventListener);
      window.addEventListener("mouseup", handleEnd);
      window.addEventListener("touchmove", handleTouchMove as unknown as EventListener);
      window.addEventListener("touchend", handleEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove as unknown as EventListener);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleTouchMove as unknown as EventListener);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging, dragStart]);

  const containerBg = isDarkTheme ? "bg-[#1e1e1e]" : "bg-slate-100";
  const sliderBg = isDarkTheme ? "bg-[#30363d]" : "bg-slate-200";
  const textSecondary = isDarkTheme ? "text-gray-400" : "text-slate-500";
  const textTertiary = isDarkTheme ? "text-gray-500" : "text-slate-600";
  const accentColor = isDarkTheme ? "accent-blue-500" : "accent-blue-600";

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Crop Area - now showing full image with circular guide */}
      <div className={`relative h-80 w-80 overflow-hidden rounded-xl ${containerBg}`}>
        {/* Full image container */}
        <div
          ref={containerRef}
          className="absolute inset-0 z-10 cursor-move touch-none select-none flex items-center justify-center overflow-hidden"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          {/* Draggable image - visible fully with natural dimensions */}
          <img
            src={imageUrl}
            alt={t("profile.cropPreview")}
            className="max-w-none max-h-none pointer-events-none"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              transformOrigin: "center center",
            }}
            draggable={false}
          />
        </div>
        
        {/* Circular overlay - shows what will be cropped */}
        <div className="absolute inset-0 z-20 pointer-events-none">
          {/* Dark overlay outside circle */}
          <svg className="w-full h-full" viewBox="0 0 320 320">
            <defs>
              <mask id="circleMask">
                <rect width="320" height="320" fill="white"/>
                <circle cx="160" cy="160" r="128" fill="black"/>
              </mask>
            </defs>
            <rect width="320" height="320" fill="rgba(0,0,0,0.5)" mask="url(#circleMask)"/>
          </svg>
          
          {/* Circle border */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-64 h-64 rounded-full border-4 border-white shadow-lg" />
          </div>
          
          {/* Grid lines inside circle */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 rounded-full relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-full w-px bg-white/50" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-px w-full bg-white/50" />
              </div>
              <div className="absolute inset-4 rounded-full border border-white/30" />
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="w-full max-w-xs space-y-3">
        <div className="flex items-center gap-3">
          <span className={`text-xs ${textSecondary}`}>{t("core.avatar.scale")}</span>
          <input
            type="range"
            min="0.1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className={`flex-1 h-2 ${sliderBg} rounded-lg appearance-none cursor-pointer ${accentColor}`}
          />
          <span className={`text-xs ${textTertiary} w-10`}>{(zoom * 100).toFixed(0)}%</span>
        </div>
        
        <p className={`text-xs ${textSecondary} text-center`}>
          {t("core.avatar.cropHint")}
        </p>
      </div>
    </div>
  );
}
