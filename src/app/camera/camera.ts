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
import { ConfigService } from '../services/config.service';
import { TranslocoPipe } from '@ngneat/transloco';
import { TranslocoService } from '@ngneat/transloco';

@Component({
  selector: 'app-camera',
  standalone: true,
  imports: [CommonModule, ChartComponent, TranslocoPipe],
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
  @ViewChild('captureFrame') captureFrameRef!: ElementRef<SVGUseElement>;

  // Signals
  feedback = signal("Press 'Start capture' button");
  detections = signal<string[]>([]);
  proportion = signal<number | null>(null);
  capturedImage = signal<string | null>(null);
  isFrozen = signal(false);
  cameraReady = signal(true);
  directionMessage = signal<string | null>(null);
  showFeedbackMessage = signal(false);
  showCapturedPhotoSignal = signal(false);
  showRetryConfirmMessageSignal = signal(false);
  showToastOk = signal(false);

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

  showTogglePanel = signal(true);
  showPermissionSlider = signal(true);
  showDetections = signal(false);
  showBoxes = signal(false);

  nearThreshold = signal(0.99); // demasiado cerca
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

  svgWidth = 448;
  svgHeight = 282;

  constructor(
    private tfModelService: TfModel,
    private config: ConfigService,
    private transloco: TranslocoService
  ) {}

  ngOnInit() {
    const cfg = this.config.config();

    // Set configurations
    this.showTogglePanel.set(this.config.getFeature('showDetectionsPanel'));

    console.log('Active component configuration:', cfg);
  }

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

  // Start handling the UI 'Start' button click (this is called from template)
  async startCapture() {
    if (!this.stream) return;

    const startBtn = this.startBtnRef?.nativeElement;
    if (startBtn) startBtn.style.display = 'none';

    await this.requestFullscreenAndOrientation();
    await this.initVideoAndCanvases();
    this.initReferenceShapes();
    await this.showGeneralInstructionsMessage();

    if (this.config.getFeature('enableObjectDetection')) {
      await this.runDetectionLoop();
    }
  }

  private async showGeneralInstructionsMessage() {
    this.feedback.set(this.transloco.translate('framing.generalIsntructions'));
    this.showFeedbackMessage.set(true);

    await new Promise((resolve) => setTimeout(resolve, 3000));
    this.showFeedbackMessage.set(false);
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
      this.feedback.set(this.transloco.translate('camera.ready'));
      // ocultamos slider y marcamos cámara lista
      this.showPermissionSlider.set(false);
      this.cameraReady.set(true);
    } catch (err) {
      this.feedback.set(this.transloco.translate('camera.notAllowed'));
    }
  }

  private async initVideoAndCanvases() {
    if (!this.stream) {
      this.feedback.set(this.transloco.translate('camera.noStream'));
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

    const frameSvgUseElement = this.captureFrameRef.nativeElement;
    const frameBoundingClientRect = frameSvgUseElement.getBoundingClientRect();
    const frameWidth = frameBoundingClientRect.width;
    const frameHeight = frameBoundingClientRect.height;
    const frameOffsetX = frameBoundingClientRect.x;
    const frameOffsetY = frameBoundingClientRect.y;

    // center within the available area
    // const offsetX = w * 0.5 - frameWidth * 0.5;
    // const offsetY = h * 0.5 - frameHeight * 0.5;

    // const rectResult = this.createScaledPath(this.rectPath, w, h);
    this.rectPath2D = new Path2D();
    this.rectPath2D.rect(frameOffsetX, frameOffsetY, frameWidth, frameHeight);
    this.rectMetrics.offsetX = frameOffsetX;
    this.rectMetrics.offsetY = frameOffsetY;
    this.rectMetrics.width = frameWidth;
    this.rectMetrics.height = frameHeight;

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
    let message: string = 'framing.guideance.';

    if (Math.abs(dx) > toleranceX) {
      centered = false;
      if (dx > 0) {
        arrows.right = true;
        message += 'right';
      } else {
        arrows.left = true;
        message += 'left';
      }
    }
    if (Math.abs(dy) > toleranceY) {
      centered = false;
      if (dy > 0) {
        arrows.down = true;
        if (arrows.right || arrows.left) {
          message += 'Down';
        } else {
          message += 'down';
        }
      } else {
        arrows.up = true;
        if (arrows.right || arrows.left) {
          message = 'Up';
        } else {
          message = 'up';
        }
      }
    }

    this.arrowDirection.set(arrows);
    this.isCentered.set(centered);
    this.feedback.set(this.transloco.translate(message));
  }

  private getMainCar(
    detections: cocoSsd.DetectedObject[]
  ): cocoSsd.DetectedObject | null {
    if (detections.length === 1) {
      return detections[0];
    }

    // We analyze their sizes
    const vehicleAreas = detections.map((v) => ({
      ...v,
      area: v.bbox[2] * v.bbox[3], // width * height
    }));

    // Order from bigger to smaller area
    vehicleAreas.sort((a, b) => b.area - a.area);

    const largest = vehicleAreas[0];
    const second = vehicleAreas[1];

    // Verify percentual difference
    const sizeDifference = (largest.area - second.area) / largest.area;

    if (sizeDifference < 0.1) {
      // Less than 10% of areas sizes difference
      this.feedback.set(this.transloco.translate('framing.oneVehicle'));
      return null;
    }

    // If there's enough difference
    return largest;
  }

  private async runDetectionLoop() {
    const canvas = this.detectionCanvasRef.nativeElement;
    const overlayCanvas = this.overlayCanvasRef.nativeElement;
    const video = this.videoRef.nativeElement;

    this.model = await this.tfModelService.getModelReady();

    this.detectionTimer = setInterval(async () => {
      // If it is not in the process of capturing the photo
      if (this.isCapturingPhoto) {
        return;
      }

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
      //this.drawBackgroundAndRefereceCanvas(overlayCanvas);
      this.initReferenceShapes();

      // draw detections

      if (this.showBoxes()) {
        this.drawBoundingBoxes(predictions);
      }

      // check car-like classes
      const vehicles = predictions.filter((p) =>
        ['car', 'truck', 'bus'].includes(p.class)
      );

      // We will store the main care here
      let car: cocoSsd.DetectedObject | null;

      this.showFeedbackMessage.set(true);
      // If no vehicle was detected
      if (vehicles.length === 0) {
        this.feedback.set(this.transloco.translate('framing.noCar'));
        this.disableFramingGuides();
        this.proportion.set(null);
        return;
      }

      if (vehicles.length > 1) {
        car = this.getMainCar(vehicles);
      } else {
        car = vehicles[0];
      }

      if (car) {
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
          this.feedback.set(this.transloco.translate('framing.tooNear'));
        } else if (proportion < this.farThreshold()) {
          this.feedback.set(this.transloco.translate('framing.tooFar'));
        } else {
          this.feedback.set(this.transloco.translate('framing.perfect'));
          this.isCapturingPhoto = true;
          // Freeze the video frame to capture it
          this.freezeFrame();
          if (!this.isAnimating) {
            await this.orchestratePhotoCapturingAsync();
          }
        }
      } else {
        this.disableFramingGuides();
        this.proportion.set(null);
      }
    }, 1000);
  }

  freezeFrame() {
    this.isFrozen.set(true); // Signal para ocultar video y mostrar canvas
  }

  unfreezeFrame() {
    this.isFrozen.set(false);

    // Mark the end of the capturing process
    this.isCapturingPhoto = false;
  }

  async capturePhotoAsync() {
    const frozenCanvas = this.detectionCanvasRef.nativeElement;
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

    await this.showCapturedPhoto();
  }

  async showCapturedPhoto() {
    this.showCapturedPhotoSignal.set(true);

    if (this.config.getFeature('showPhotoConfirmation')) {
      this.showRetryConfirmMessageSignal.set(true);
    } else {
      await this.usePhoto();
    }
  }

  retryPhoto() {
    this.capturedImage.set(null);
    this.showCapturedPhotoSignal.set(false);
    this.unfreezeFrame();
  }

  async usePhoto() {
    await this.showImageOkMessageAsync();
    this.showCapturedPhotoSignal.set(false);
    this.unfreezeFrame();
    // Aquí podrías emitir un evento al padre o guardar la foto en backend
  }

  private async animateFrameGlowAsync() {
    if (this.isAnimating) return;
    this.isAnimating = true;

    this.showFeedbackMessage.set(false);

    const svgEl = this.irregularPathRef.nativeElement.closest('svg');
    svgEl?.classList.add('glow');

    // Wait 1 second to let the animation to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    this.isAnimating = false;
    svgEl?.classList.remove('glow');
  }

  private async startFillAnimationAsync() {
    if (this.isAnimatingFill) return;
    this.isAnimatingFill = true;

    this.showFeedbackMessage.set(true);
    this.feedback.set(this.transloco.translate('analizingAI'));

    const pathEl = this.irregularPathRef.nativeElement;
    pathEl.setAttribute('fill', 'url(#fillGradient)');

    pathEl.classList.add('animate-fill');

    // Wait 3 seconds to simulate the AI Analyzing
    await new Promise((resolve) => setTimeout(resolve, 3000));

    this.isAnimatingFill = false;
    this.showFeedbackMessage.set(false);
    pathEl.classList.remove('animate-fill');
  }

  private async showImageOkMessageAsync() {
    this.showRetryConfirmMessageSignal.set(false);
    this.showToastOk.set(true);

    // Wait 2 seconds showing the message
    await new Promise((resolve) => setTimeout(resolve, 2000));

    this.showToastOk.set(false);
  }

  private async orchestratePhotoCapturingAsync() {
    // Hide the framing arrows
    this.disableFramingGuides();

    // Start animate glow
    await this.animateFrameGlowAsync();

    // Simulate AI Analyzing
    await this.startFillAnimationAsync();

    // Capture video frame
    await this.capturePhotoAsync();
  }
}
