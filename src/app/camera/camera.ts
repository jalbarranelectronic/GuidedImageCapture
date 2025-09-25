import {
  Component,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-cpu';
import '@tensorflow/tfjs-backend-webgl';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { ChartComponent } from '../chart/chart';
import { RECT_PATH } from '../shapes/rect-shape';
import { FRONTLEFT_PATH } from '../shapes/frontleft-shape';

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

  // Signals
  feedback = signal('Loading ODM...');
  detections = signal<string[]>([]);
  proportion = signal<number | null>(null);
  capturedImage = signal<string | null>(null);

  showDetections = signal(false);
  showBoxes = signal(false);

  nearThreshold = signal(0.9); // demasiado cerca
  farThreshold = signal(0.7); // demasiado lejos

  private ctx!: CanvasRenderingContext2D;
  private overlayCtx!: CanvasRenderingContext2D;
  private model!: cocoSsd.ObjectDetection;
  private detectionTimer: any;
  private stream: MediaStream | null = null;

  // Animate flag
  private animate = false;

  // Paths and scales
  private marcoPath!: Path2D;
  private rectPath!: Path2D;
  private rectScaleX = 1;
  private rectScaleY = 1;

  // Car outline data
  private frontLeftOutlinePathData = new Path2D(FRONTLEFT_PATH);
  private rectPathData = new Path2D(RECT_PATH);

  private svgWidth = 597;
  private svgHeight = 289;

  async ngAfterViewInit() {
    // Request camera access early
    try {
      this.feedback.set('Requesting camera access...');
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      this.feedback.set('Camera ready. Press START.');
    } catch (err) {
      console.error(err);
      this.feedback.set("❌ Couldn't access the camera.");
      return;
    }
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
    // use 10% margins like your final HTML
    const marginX = canvasWidth * 0.1;
    const marginY = canvasHeight * 0.1;

    const availableWidth = canvasWidth - 2 * marginX;
    const availableHeight = canvasHeight - 2 * marginY;

    const scaleX = availableWidth / this.svgWidth;
    const scaleY = availableHeight / this.svgHeight;

    const scaledWidth = this.svgWidth * scaleX;
    const scaledHeight = this.svgHeight * scaleY;

    // center within the available area
    const offsetX = marginX + (availableWidth - scaledWidth) / 2;
    const offsetY = 16;

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
    if (!this.stream) {
      this.feedback.set('❌ No camera stream.');
      return;
    }
    const video = this.videoRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;
    const overlayCanvas = this.overlayCanvasRef.nativeElement;

    video.srcObject = this.stream;
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');

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

    const rectResult = this.createScaledPath(this.rectPathData, w, h);
    this.rectPath = rectResult.path;
    this.rectScaleX = rectResult.scaleX;
    this.rectScaleY = rectResult.scaleY;

    const marcoResult = this.createScaledPath(
      this.frontLeftOutlinePathData,
      w,
      h
    );
    this.marcoPath = marcoResult.path;

    // redraw overlay with shapes
    this.overlayCtx.clearRect(0, 0, w, h);

    // 🔹 Dibujar overlay y marcos de referencia
    this.drawBackgroundAndRefereceCanvas(overlayCanvas);
  }

  private drawBackgroundAndRefereceCanvas(overlayCanvas: HTMLCanvasElement) {
    // 🔹 Dibujar overlay alrededor del marco irregular
    this.overlayCtx.save();

    // Pintar todo el fondo con color semi-transparente
    this.overlayCtx.fillStyle = 'rgba(39, 39, 39, 0.50)'; // #272727 con 50% opacidad
    this.overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // Cambiar modo de mezcla para "recortar" el marco
    this.overlayCtx.globalCompositeOperation = 'destination-out';
    this.overlayCtx.fill(this.marcoPath);

    // Restaurar operación normal
    this.overlayCtx.globalCompositeOperation = 'source-over';

    // reference rect
    if (this.showBoxes()) {
      this.overlayCtx.strokeStyle = 'rgba(255, 255, 0, 1)';
    } else {
      this.overlayCtx.strokeStyle = 'rgba(255, 255, 0, 0)';
    }
    this.overlayCtx.lineWidth = 0;
    this.overlayCtx.stroke(this.rectPath);

    // irregular marco
    this.overlayCtx.strokeStyle = 'white';
    this.overlayCtx.lineWidth = 2;
    this.overlayCtx.setLineDash([]);
    this.overlayCtx.stroke(this.marcoPath);
    this.overlayCtx.restore();
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
          this.overlayCtx.isPointInPath(this.rectPath, px, py)
        );

        // compute areas: car area vs scaled rect area (use rectScale values)
        const carArea = w * h;
        const rectArea =
          this.svgWidth * this.rectScaleX * (this.svgHeight * this.rectScaleY);
        const proportion = carArea / rectArea;
        this.proportion.set(+proportion.toFixed(3));

        const prop = proportion;
        if (!dentro || prop > this.nearThreshold()) {
          this.feedback.set('Adjust the framing or step back a little. 🚗⬅️');
        } else if (prop < this.farThreshold()) {
          this.feedback.set("You're too far 🚗➡️");
        } else {
          this.feedback.set("Perfect! Don't move, capturing... 📸");

          if (!this.capturedImage()) {
            // solo capturar si aún no hay foto
            this.capturePhoto();
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

    const photoCanvas = document.createElement('canvas');
    photoCanvas.width = video.videoWidth;
    photoCanvas.height = video.videoHeight;
    const ctx = photoCanvas.getContext('2d');

    // Calcular proporciones
    const videoRatio = video.videoWidth / video.videoHeight;
    const displayRatio =
      this.overlayCanvasRef.nativeElement.width /
      this.overlayCanvasRef.nativeElement.height;

    let sx = 0,
      sy = 0,
      sWidth = video.videoWidth,
      sHeight = video.videoHeight;

    if (videoRatio > displayRatio) {
      // 📐 El video es más ancho que la pantalla → recortar horizontal
      sWidth = video.videoHeight * displayRatio;
      sx = (video.videoWidth - sWidth) / 2;
    } else {
      // 📐 El video es más alto que la pantalla → recortar vertical
      sHeight = video.videoWidth / displayRatio;
      sy = (video.videoHeight - sHeight) / 2;
    }

    if (ctx) {
      ctx.drawImage(
        video,
        sx,
        sy,
        sWidth,
        sHeight,
        0,
        0,
        photoCanvas.width,
        photoCanvas.height
      );
      this.capturedImage.set(photoCanvas.toDataURL('image/png')); // signal con la foto
    }
  }

  usePhoto() {
    alert('Foto confirmada ✅');
    // Aquí podrías emitir un evento al padre o guardar la foto en backend
  }
}
