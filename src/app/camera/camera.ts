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
import { RECT_PATH } from '../shapes/rect-shape';
import { FRONTLEFT_PATH } from '../shapes/frontleft-shape';
import { RectMetrics } from './rect-metrics';

@Component({
  selector: 'app-camera',
  standalone: true,
  imports: [CommonModule, ChartComponent],
  templateUrl: './camera.html',
  styleUrl: './camera.css',
})
export class CameraComponent implements AfterViewInit, OnDestroy {
  @ViewChild('video') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas') overlayCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('startBtn') startBtnRef!: ElementRef<HTMLButtonElement>;
  @ViewChild('irregularPath') irregularPathRef!: ElementRef<SVGPathElement>;
  @ViewChild('rectPath') rectPathRef!: ElementRef<SVGPathElement>;

  // Signals
  feedback = signal("Press 'Start capture' button");
  detections = signal<string[]>([]);
  proportion = signal<number | null>(null);
  capturedImage = signal<string | null>(null);

  showDetections = signal(false);
  showBoxes = signal(false);

  nearThreshold = signal(0.98); // demasiado cerca
  farThreshold = signal(0.9); // demasiado lejos

  private ctx!: CanvasRenderingContext2D;
  private overlayCtx!: CanvasRenderingContext2D;
  private model!: cocoSsd.ObjectDetection;
  private detectionTimer: any;
  private stream: MediaStream | null = null;

  // Animate flag
  isAnimating = false;

  // Paths and scales
  // private marcoPath2D!: Path2D;
  private rectPath2D!: Path2D;
  private rectMetrics: RectMetrics = {
    scaleX: 0,
    scaleY: 0,
    offsetX: 0,
    offsetY: 0,
    scaledWidth: 0,
    scaledHeight: 0,
  };

  // Car outline data
  outlinePathData = FRONTLEFT_PATH;
  rectPathData = RECT_PATH;
  private frontLeftOutlinePathData = new Path2D(FRONTLEFT_PATH);
  private rectPath = new Path2D(RECT_PATH);

  svgWidth = 597;
  svgHeight = 289;

  ngAfterViewInit() {
    // Configurar dasharray dinámicamente según la longitud del path
    const pathEl = this.irregularPathRef.nativeElement;
    const length = pathEl.getTotalLength();
    pathEl.style.setProperty('--path-length', `${length}`);
    /*pathEl.style.strokeDasharray = `${length}`;
    pathEl.style.strokeDashoffset = `${length}`;*/
  }

  ngOnDestroy() {
    if (this.detectionTimer) clearInterval(this.detectionTimer);
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
    }
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
    const startBtn = this.startBtnRef?.nativeElement;
    if (startBtn) startBtn.style.display = 'none';

    await this.requestFullscreenAndOrientation();
    await this.initCameraAndCanvases();
    await this.loadModel();
    this.initReferenceShapes();
    this.runDetectionLoop();
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

  private async initCameraAndCanvases() {
    try {
      this.feedback.set('Requesting camera access...');
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment' },
      });
      this.feedback.set('Camera ready.');
    } catch (err) {
      console.error(err);
      this.feedback.set("❌ Couldn't access the camera.");
      return;
    }

    if (!this.stream) {
      this.feedback.set('❌ No camera stream.');
      return;
    }

    const video = this.videoRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;
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

  private async loadModel() {
    this.feedback.set('Loading model...');
    this.model = await cocoSsd.load();
    this.feedback.set('ODM completely loaded. Press Start to search car...');
  }

  private initReferenceShapes() {
    const overlayCanvas = this.overlayCanvasRef.nativeElement;
    const w = overlayCanvas.width;
    const h = overlayCanvas.height;

    const rectResult = this.createScaledPath(this.rectPath, w, h);
    this.rectPath2D = rectResult.path;
    this.rectMetrics.offsetX = rectResult.offsetX;
    this.rectMetrics.offsetY = rectResult.offsetY;
    this.rectMetrics.scaleX = rectResult.scaleX;
    this.rectMetrics.scaleY = rectResult.scaleY;
    this.rectMetrics.scaledWidth = rectResult.scaledWidth;
    this.rectMetrics.scaledHeight = rectResult.scaledHeight;

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
      this.capturePhoto(); // tu lógica de captura
      this.isAnimating = false;
      svgEl?.classList.remove('glow');
    }, 1000);
  }

  private runDetectionLoop() {
    const canvas = this.canvasRef.nativeElement;
    const overlayCanvas = this.overlayCanvasRef.nativeElement;
    const video = this.videoRef.nativeElement;

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

      // check car-like classes
      const car = predictions.find((p) =>
        ['car', 'truck', 'bus'].includes(p.class)
      );
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
        const rectWidth = this.svgWidth * this.rectMetrics.scaleX;
        const proportion = carWidth / rectWidth;
        this.proportion.set(+proportion.toFixed(3));
        console.log(proportion);
        if (!dentro || proportion > this.nearThreshold()) {
          this.feedback.set('Adjust the framing or step back a little. 🚗⬅️');
        } else if (proportion < this.farThreshold()) {
          this.feedback.set("You're too far 🚗➡️");
        } else {
          this.feedback.set("Perfect! Don't move, capturing... 📸");

          if (!this.isAnimating) {
            this.animateFrameGlow();
          }
        }
      } else {
        this.feedback.set('I cannot detect the car, adjust the framing.');
        this.proportion.set(null);
      }
    }, 1000);
  }

  capturePhoto() {
    const video = this.videoRef.nativeElement;
    // We will cut the image to this rectangle
    const { offsetX, offsetY, scaledWidth, scaledHeight } = this.rectMetrics;

    // We cut 8% from the bottom and 8% from the top
    // const marginY = scaledHeight * 0.8;
    // const newHeight = scaledHeight - 2 * marginY;
    // const newOffsetY = offsetY + marginY;

    const photoCanvas = document.createElement('canvas');
    photoCanvas.width = scaledWidth;
    photoCanvas.height = scaledHeight; //newHeight;

    const ctx = photoCanvas.getContext('2d');
    ctx?.drawImage(
      video,
      offsetX,
      offsetY,
      scaledWidth,
      scaledHeight,
      0,
      0,
      scaledWidth,
      scaledHeight
    );
    this.capturedImage.set(photoCanvas.toDataURL('image/png')); // signal con la foto
  }

  usePhoto() {
    alert('Foto confirmada ✅');
    // Aquí podrías emitir un evento al padre o guardar la foto en backend
  }
}
