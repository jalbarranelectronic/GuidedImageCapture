import {
  Component,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-cpu';
import '@tensorflow/tfjs-backend-webgl';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { ChartComponent } from '../chart/chart';
import { FRONTLEFT_PATH } from '../shapes/frontleft-shape';
import { RectMetrics } from './rect-metrics';
import { TfModel } from './tf-model';

@Component({
  selector: 'app-camera',
  standalone: true,
  imports: [CommonModule, ChartComponent],
  templateUrl: './camera.html',
  styleUrl: './camera.css',
})
export class CameraComponent implements AfterViewInit, OnDestroy {
  @ViewChild('video') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('detectionCanvas')
  detectionCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas') overlayCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('startBtn') startBtnRef!: ElementRef<HTMLButtonElement>;
  @ViewChild('irregularPath') irregularPathRef!: ElementRef<SVGPathElement>;
  @ViewChild('rectPath') rectPathRef!: ElementRef<SVGPathElement>;
  @ViewChild('freezeCanvas') freezeCanvasRef!: ElementRef<HTMLCanvasElement>;

  // Signals
  feedback = signal("Press 'Start capture' button");
  detections = signal<string[]>([]);
  proportion = signal<number | null>(null);
  capturedImage = signal<string | null>(null);
  isFrozen = signal(false);
  cameraReady = signal(true);
  directionMessage = signal<string | null>(null);
  showDirectionMessage = signal(false);

  arrowDirection = signal<{
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
  }>({
    left: false,
    right: false,
    up: false,
    down: false,
  });
  isCentered = signal(false);

  showPermissionSlider = signal(true);
  showDetections = signal(false);
  showBoxes = signal(false);

  nearThreshold = signal(0.98); // demasiado cerca
  farThreshold = signal(0.88); // demasiado lejos

  private ctx!: CanvasRenderingContext2D;
  private overlayCtx!: CanvasRenderingContext2D;
  private model!: cocoSsd.ObjectDetection;
  private detectionTimer: any;
  private stream: MediaStream | null = null;

  // Animate flag
  isCapturingPhoto = false;
  isAnimating = false;
  isAnimatingFill = false;

  // Paths and scales
  // private marcoPath2D!: Path2D;
  private rectPath2D!: Path2D;
  private rectMetrics: RectMetrics = {
    offsetX: 0,
    offsetY: 0,
    width: 0,
    height: 0,
  };

  // Car outline data
  outlinePathData = FRONTLEFT_PATH;

  svgWidth = 534;
  svgHeight = 260;

  constructor(private tfModelService: TfModel) {}

  ngAfterViewInit() {
    // Configurar dasharray dinámicamente según la longitud del path
    const pathEl = this.irregularPathRef.nativeElement;
    const length = pathEl.getTotalLength();
    pathEl.style.setProperty('--path-length', `${length}`);
  }

  ngOnDestroy() {
    if (this.detectionTimer) clearInterval(this.detectionTimer);
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
    }
  }

  showArrow(dir: 'left' | 'right' | 'up' | 'down') {
    return this.arrowDirection()[dir];
  }

  showCentered() {
    return this.isCentered();
  }

  toggleDetections() {
    this.showDetections.update((v) => !v);
  }

  toggleBoxes() {
    this.showBoxes.update((v) => !v);
  }

  setNearThreshold(value: number) {
    this.nearThreshold.set(Number(value));
  }

  setFarThreshold(value: number) {
    this.farThreshold.set(Number(value));
  }

  // helper: create scaled Path2D and scales with margin (centered)
  private createScaledPath(
    rawPath: Path2D,
    canvasWidth: number,
    canvasHeight: number
  ) {
    const marginX = canvasWidth * 0.05;
    const marginY = canvasHeight * 0.08;

    const availableWidth = canvasWidth - 2 * marginX;
    const availableHeight = canvasHeight - 2 * marginY;

    const scaleX = availableWidth / this.svgWidth;
    const scaleY = availableHeight / this.svgHeight;

    const scaledWidth = this.svgWidth * scaleX;
    const scaledHeight = this.svgHeight * scaleY;

    // center within the available area
    const offsetX = marginX + (availableWidth - scaledWidth) / 2;
    const offsetY = 15;

    const transformed = new Path2D();
    transformed.addPath(
      rawPath,
      new DOMMatrix().translate(offsetX, offsetY).scale(scaleX, scaleY)
    );

    return {
      path: transformed,
      scaleX,
      scaleY,
      offsetX,
      offsetY,
      scaledWidth,
      scaledHeight,
    };
  }

  // Start handling the UI 'Start' button click (this is called from template)
  async startCapture() {
    if (!this.stream) return;

    const startBtn = this.startBtnRef?.nativeElement;
    if (startBtn) startBtn.style.display = 'none';

    await this.requestFullscreenAndOrientation();
    await this.initVideoAndCanvases();
    this.initReferenceShapes();
    await this.runDetectionLoop();
  }

  // request fullscreen & lock landscape (best-effort)
  private async requestFullscreenAndOrientation() {
    try {
      await ((document.documentElement as any).requestFullScreen?.() ||
        (document.documentElement as any).webkitRequestFullscreen?.() ||
        (document.documentElement as any).mozRequestFullScreen?.() ||
        (document.documentElement as any).msRequestFullscreen?.());
    } catch (err) {
      console.warn("Can't force fullscreen/orientation:", err);
    }
  }

  async requestCameraAccess() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      });
      this.feedback.set('Camera ready.');
      // ocultamos slider y marcamos cámara lista
      this.showPermissionSlider.set(false);
      this.cameraReady.set(true);
    } catch (err) {
      this.feedback.set("❌ Couldn't access the camera.");
    }
  }

  private async initVideoAndCanvases() {
    if (!this.stream) {
      this.feedback.set('❌ No camera stream.');
      return;
    }

    const video = this.videoRef.nativeElement;
    const canvas = this.detectionCanvasRef.nativeElement;
    const overlayCanvas = this.overlayCanvasRef.nativeElement;

    video.srcObject = this.stream;

    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => {
        // set canvas sizes to video size (important)
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        overlayCanvas.width = video.videoWidth;
        overlayCanvas.height = video.videoHeight;

        this.ctx = canvas.getContext('2d')!;
        this.overlayCtx = overlayCanvas.getContext('2d')!;
        resolve();
      };
    });

    // initial canvas draw
    this.overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }

  private initReferenceShapes() {
    const overlayCanvas = this.overlayCanvasRef.nativeElement;
    const w = overlayCanvas.width;
    const h = overlayCanvas.height;

    const marginX = w * 0.05;
    const marginY = h * 0.05;

    const availableWidth = w - 2 * marginX;
    const availableHeight = h - 2 * marginY;

    // center within the available area
    const offsetX = marginX;
    const offsetY = 0;

    // const rectResult = this.createScaledPath(this.rectPath, w, h);
    this.rectPath2D = new Path2D();
    this.rectPath2D.rect(offsetX, offsetY, availableWidth, availableHeight);
    this.rectMetrics.offsetX = offsetX;
    this.rectMetrics.offsetY = offsetY;
    this.rectMetrics.width = availableWidth;
    this.rectMetrics.height = availableHeight;

    // redraw overlay with shapes
    this.overlayCtx.clearRect(0, 0, w, h);

    // 🔹 Dibujar overlay y marcos de referencia
    this.drawBackgroundAndRefereceCanvas(overlayCanvas);
  }

  private drawBackgroundAndRefereceCanvas(overlayCanvas: HTMLCanvasElement) {
    // reference rect
    if (this.showBoxes()) {
      this.overlayCtx.strokeStyle = 'rgba(255, 255, 0, 1)';
    } else {
      this.overlayCtx.strokeStyle = 'rgba(255, 255, 0, 0)';
    }
    this.overlayCtx.lineWidth = 0;
    this.overlayCtx.stroke(this.rectPath2D);
  }

  private animateFrameGlow() {
    if (this.isAnimating) return;
    this.isAnimating = true;

    const svgEl = this.irregularPathRef.nativeElement.closest('svg');
    svgEl?.classList.add('glow');

    setTimeout(() => {
      this.isAnimating = false;
      this.startFillAnimation();
      svgEl?.classList.remove('glow');
    }, 1000);
  }

  private startFillAnimation() {
    if (this.isAnimatingFill) return;
    this.isAnimatingFill = true;

    const pathEl = this.irregularPathRef.nativeElement;
    pathEl.setAttribute('fill', 'url(#fillGradient)');

    pathEl.classList.add('animate-fill');

    // Simualte waiting time for response of AI Quality Checks
    setTimeout(() => {
      this.isAnimatingFill = false;
      this.capturePhoto();
      pathEl.classList.remove('animate-fill');
    }, 3000);
  }

  private drawBoundingBoxes(predictions: cocoSsd.DetectedObject[]) {
    predictions.forEach((p) => {
      const [x, y, w, h] = p.bbox;
      this.overlayCtx.strokeStyle = 'red';
      this.overlayCtx.lineWidth = 2;
      this.overlayCtx.strokeRect(x, y, w, h);

      this.overlayCtx.fillStyle = 'red';
      this.overlayCtx.font = '16px monospace';
      const labelY = y > 20 ? y - 6 : y + 16;
      this.overlayCtx.fillText(
        `${p.class} ${(p.score * 100).toFixed(1)}%`,
        x,
        labelY
      );
    });
  }

  private disableFramingGuides() {
    const arrows = { left: false, right: false, up: false, down: false };
    this.arrowDirection.set(arrows);
  }

  private enableFramingGuides(car: cocoSsd.DetectedObject) {
    const [x, y, w, h] = car.bbox;

    const carCenter = { x: x + w / 2, y: y + h / 2 };
    const { offsetX, offsetY, width, height } = this.rectMetrics;
    const rectCenter = { x: offsetX + width / 2, y: offsetY + height / 2 };

    const dx = carCenter.x - rectCenter.x;
    const dy = carCenter.y - rectCenter.y;

    const toleranceX = width * 0.05;
    const toleranceY = height * 0.05;

    const arrows = { left: false, right: false, up: false, down: false };
    let centered = true;
    let showMessage = false;
    let message: string = '';
    // Clear message
    this.showDirectionMessage.set(showMessage);

    if (Math.abs(dx) > toleranceX) {
      centered = false;
      showMessage = true;
      if (dx > 0) {
        arrows.right = true;
        message = 'Move camera to the right';
      } else {
        arrows.left = true;
        message = 'Move camera to the left';
      }
    }
    if (Math.abs(dy) > toleranceY) {
      centered = false;
      showMessage = true;
      if (dy > 0) {
        arrows.down = true;
        if (arrows.right || arrows.left) {
          message += ' and downward';
        } else {
          message = 'Move the camera downward';
        }
      } else {
        arrows.up = true;
        if (arrows.right || arrows.left) {
          message = ' and upward';
        } else {
          message = 'Move the camera upward';
        }
      }
    }

    this.arrowDirection.set(arrows);
    this.isCentered.set(centered);
    this.feedback.set(message);
  }

  private async runDetectionLoop() {
    const canvas = this.detectionCanvasRef.nativeElement;
    const overlayCanvas = this.overlayCanvasRef.nativeElement;
    const video = this.videoRef.nativeElement;

    this.model = await this.tfModelService.getModelReady();
    this.feedback.set('Model ready. Start recognizing objects');

    this.detectionTimer = setInterval(async () => {
      // draw current frame to hidden canvas
      this.ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const predictions = await this.model.detect(canvas);
      this.detections.set(
        predictions.map((p) => `${p.class} (${(p.score * 100).toFixed(1)}%)`)
      );

      // clear overlay and redraw reference shapes
      this.overlayCtx.clearRect(
        0,
        0,
        overlayCanvas.width,
        overlayCanvas.height
      );

      // 🔹  Dibujar overlay y marcos de referencia
      this.drawBackgroundAndRefereceCanvas(overlayCanvas);

      // draw detections

      if (this.showBoxes()) {
        this.drawBoundingBoxes(predictions);
      }

      // check car-like classes
      const car = predictions.find((p) =>
        ['car', 'truck', 'bus'].includes(p.class)
      );
      if (car && !this.isCapturingPhoto) {
        const [x, y, w, h] = car.bbox;

        // test if bbox corners inside rectPath

        const dentro = [
          [x, y],
          [x + w, y],
          [x, y + h],
          [x + w, y + h],
        ].every(([px, py]) =>
          this.overlayCtx.isPointInPath(this.rectPath2D, px, py)
        );

        const carWidth = w;
        const rectWidth = this.rectMetrics.width;
        const proportion = carWidth / rectWidth;
        this.proportion.set(+proportion.toFixed(3));
        console.log(proportion);

        if (!dentro) {
          this.enableFramingGuides(car);
        } else if (proportion > this.nearThreshold()) {
          this.feedback.set('Step back a little. 🚗➡️');
        } else if (proportion < this.farThreshold()) {
          this.feedback.set("You're too far 🚗⬅️");
        } else {
          this.feedback.set("Perfect! Don't move, capturing... 📸");
          this.isCapturingPhoto = true;
          this.freezeFrame();
          if (!this.isAnimating) {
            this.animateFrameGlow();
          }
        }
      } else {
        this.feedback.set('I cannot detect the car, adjust the framing.');
        this.disableFramingGuides();
        this.proportion.set(null);
      }
    }, 1000);
  }

  freezeFrame() {
    const video = this.videoRef.nativeElement;
    const canvas = this.freezeCanvasRef.nativeElement; // canvas oculto en el template
    const ctx = canvas.getContext('2d')!;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    this.isFrozen.set(true); // Signal para ocultar video y mostrar canvas
  }

  unfreezeFrame() {
    this.isFrozen.set(false);
  }

  capturePhoto() {
    const frozenCanvas = this.freezeCanvasRef.nativeElement;
    // We will cut the image to this rectangle
    const { offsetX, offsetY, width, height } = this.rectMetrics;

    // We cut 10% from the bottom and 10% from the top
    const marginY = height * 0.1;
    const newHeight = height - 2 * marginY;
    const newOffsetY = offsetY + marginY;

    const photoCanvas = document.createElement('canvas');
    photoCanvas.width = width;
    photoCanvas.height = newHeight;

    const ctx = photoCanvas.getContext('2d');
    ctx?.drawImage(
      frozenCanvas,
      offsetX,
      newOffsetY,
      width,
      newHeight,
      0,
      0,
      width,
      newHeight
    );
    this.capturedImage.set(photoCanvas.toDataURL('image/png')); // signal con la foto
    this.isCapturingPhoto = false;
  }

  retryPhoto() {
    this.capturedImage.set(null);
    this.unfreezeFrame();
  }

  usePhoto() {
    alert('Foto confirmada ✅');
    this.unfreezeFrame();
    // Aquí podrías emitir un evento al padre o guardar la foto en backend
  }
}
