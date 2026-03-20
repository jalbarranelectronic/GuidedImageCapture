import { computed, Injectable, signal } from '@angular/core';

export interface QualityMetrics {
  blur: number; // Unit: Laplacian variance
  motion: number; // Unit: Medium difference of per-pixel luminiscence [0-255]
  brightness: number; // Unit: Average luminiscence [0-255]
}

@Injectable({
  providedIn: 'root',
})
export class ImageQualityService {
  // ==============================
  // THRESHOLDS
  // ==============================

  // Blur (Laplacian variance)
  // Valores típicos:
  // - < 50   : blurry
  // - 80-150 : acceptable
  // - > 200  : very clear
  private readonly BLUR_MIN = 50;
  private readonly BLUR_OPT = 200;

  // Motion (frame-to-framne luminance diff)
  // - < 2   : stable
  // - 2-5   : light movement
  // - > 8   : unstable
  private readonly MOTION_MAX = 8;

  // Brightness (average luminance)
  // - < 50   : dark
  // - 90-170 : good
  // - > 8    : overexposed
  private readonly BRIGHTNESS_IDEAL = 130;
  private readonly BRIGHTNESS_RANGE = 70;

  // FInal score
  private readonly CAPTURE_SCORE_THRESHOLD = 0.75;

  // ==================================================
  // 🖼 INFRAESTRUCTURA
  // ==================================================
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private lastGray?: Float32Array;

  constructor() {
    // Low resolution = best mobile performance
    this.canvas.width = 320;
    this.canvas.height = 240;
  }

  // ==================================================
  // METRICS THROTTLING
  // ==================================================
  private frameCount = 0;

  private readonly MOTION_EVERY_N_FRAMES = 1; // every frame
  private readonly BRIGHTNESS_EVERY_N_FRAMES = 3;
  private readonly BLUR_EVERY_N_FRAMES = 7;

  // ==================================================
  // BAsE SIGNALS
  // ==================================================
  private blur = signal(0);
  private motion = signal(0);
  private brightness = signal(0);

  // ==================================================
  // PUBLIC SIGNALS
  // ==================================================
  metrics = computed<QualityMetrics>(() => ({
    blur: this.blur(),
    motion: this.motion(),
    brightness: this.brightness(),
  }));

  // ==================================================
  // AGG QUALITY SCORE
  // ==================================================
  qualityScore = computed(
    () =>
      this.blurScore() * 0.5 +
      this.motionScore() * 0.3 +
      this.brightnessScore() * 0.2
  );

  // ==================================================
  // FINAL GATE
  // ==================================================
  canCapture = computed(
    () => this.qualityScore() >= this.CAPTURE_SCORE_THRESHOLD
  );

  // ==================================================
  // MORMALIZATION [0–1]
  // ==================================================
  private blurScore = computed(() => this.normalizeBlur(this.blur()));

  private motionScore = computed(() => this.normalizeMotion(this.motion()));

  private brightnessScore = computed(() =>
    this.normalizeBrightness(this.brightness())
  );

  // ==================================================
  // PUBLIC API
  // ==================================================

  analyzeVideoFrame(video: HTMLVideoElement): void {
    if (video.readyState < 2) return;

    this.frameCount++;

    const frame = this.captureFrame(video);

    // 🫨 MOTION
    // Unidad: diferencia media absoluta de luminancia por píxel [0–255]
    if (this.frameCount % this.MOTION_EVERY_N_FRAMES === 0) {
      this.motion.set(this.calculateMotion(frame));
    }

    // 💡 BRIGHTNESS
    // Unidad: luminancia promedio del frame [0–255]
    if (this.frameCount % this.BRIGHTNESS_EVERY_N_FRAMES === 0) {
      this.brightness.set(this.calculateBrightness(frame));
    }

    // 🔍 BLUR
    // Unidad: varianza del Laplaciano (adimensional)
    if (this.frameCount % this.BLUR_EVERY_N_FRAMES === 0) {
      this.blur.set(this.calculateBlur(frame));
    }
  }

  reset(): void {
    this.frameCount = 0;
    this.lastGray = undefined;
    this.blur.set(0);
    this.motion.set(0);
    this.brightness.set(0);
  }

  // ==================================================
  // CAPTURE
  // ==================================================
  private captureFrame(video: HTMLVideoElement): ImageData {
    this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);

    return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  // ==================================================
  // 🔍 BLUR — Laplacian Variance
  // Unidad: gradient variance (dimensionless)
  // ==================================================
  private calculateBlur(image: ImageData): number {
    const { data, width, height } = image;
    const gray = new Float32Array(width * height);

    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    let sum = 0;
    let sumSq = 0;
    let count = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const lap =
          gray[i - width] +
          gray[i + width] +
          gray[i - 1] +
          gray[i + 1] -
          4 * gray[i];

        sum += lap;
        sumSq += lap * lap;
        count++;
      }
    }

    const mean = sum / count;
    return sumSq / count - mean * mean;
  }

  // ==================================================
  // MOTION — Frame Difference
  // Unidad: average absolute difference in luminance per pixel [0–255]
  // ==================================================
  private calculateMotion(image: ImageData): number {
    const { data, width, height } = image;
    const gray = new Float32Array(width * height);

    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = (data[i] + data[i + 1] + data[i + 2]) / 3;
    }

    if (!this.lastGray) {
      this.lastGray = gray;
      return 0;
    }

    let diff = 0;
    for (let i = 0; i < gray.length; i++) {
      diff += Math.abs(gray[i] - this.lastGray[i]);
    }

    this.lastGray = gray;
    return diff / gray.length;
  }

  // ==================================================
  // 💡 BRIGHTNESS — Average Luminance
  // Unidad: average luminance [0–255]
  // ==================================================
  private calculateBrightness(image: ImageData): number {
    const { data } = image;
    let sum = 0;

    for (let i = 0; i < data.length; i += 4) {
      sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }

    return sum / (data.length / 4);
  }

  // ==================================================
  // 📐 NORMALIZERS → SCORE [0–1]
  // ==================================================
  private normalizeBlur(value: number): number {
    return Math.min(
      1,
      Math.max(0, (value - this.BLUR_MIN) / (this.BLUR_OPT - this.BLUR_MIN))
    );
  }

  private normalizeMotion(value: number): number {
    return Math.max(0, 1 - value / this.MOTION_MAX);
  }

  private normalizeBrightness(value: number): number {
    return Math.max(
      0,
      1 - Math.abs(value - this.BRIGHTNESS_IDEAL) / this.BRIGHTNESS_RANGE
    );
  }
}
