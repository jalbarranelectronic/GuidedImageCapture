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

  nearThreshold = signal(0.5); // demasiado cerca
  farThreshold = signal(0.4); // demasiado lejos

  private ctx!: CanvasRenderingContext2D;
  private overlayCtx!: CanvasRenderingContext2D;
  private model!: cocoSsd.ObjectDetection;
  private detectionTimer: any;
  private stream: MediaStream | null = null;

  // Paths and scales
  private marcoPath!: Path2D;
  private rectPath!: Path2D;
  private rectScaleX = 1;
  private rectScaleY = 1;

  // Car outline data
  private carOutlinePathData = `M 404.02,0.81
           C 404.02,0.81 279.92,1.17 279.92,1.17
             279.92,1.17 262.47,3.51 262.47,3.51
             262.47,3.51 246.29,6.75 246.29,6.75
             246.29,6.75 236.93,10.17 236.93,10.17
             236.93,10.17 228.12,14.66 228.12,14.66
             228.12,14.66 218.77,20.06 218.77,20.06
             218.77,20.06 209.42,26.35 209.42,26.35
             209.42,26.35 199.52,33.91 199.52,33.91
             199.52,33.91 190.89,40.92 190.89,40.92
             190.89,40.92 178.84,50.99 178.84,50.99
             178.84,50.99 168.23,61.25 168.23,61.25
             168.23,61.25 165.71,57.83 165.71,57.83
             165.71,57.83 162.65,56.39 162.65,56.39
             162.65,56.39 157.98,56.03 157.98,56.03
             157.98,56.03 153.66,56.57 153.66,56.57
             153.66,56.57 148.08,59.63 148.08,59.63
             148.08,59.63 144.31,62.32 144.31,62.32
             144.31,62.32 142.51,65.38 142.51,65.38
             142.51,65.38 142.15,69.34 142.15,69.34
             142.15,69.34 142.33,76.35 142.51,76.35
             142.69,76.35 138.37,77.07 138.37,77.07
             138.37,77.07 134.77,77.79 134.77,77.79
             134.77,77.79 129.92,79.05 129.92,79.05
             129.92,79.05 125.24,80.31 125.24,80.31
             125.24,80.31 118.59,81.57 118.59,81.57
             118.59,81.57 111.39,83.37 111.39,83.37
             111.39,83.37 106.54,84.81 106.54,84.81
             106.54,84.81 98.62,87.51 98.62,87.51
             98.62,87.51 92.15,90.74 92.15,90.74
             92.15,90.74 86.21,92.72 86.21,92.72
             86.21,92.72 81.36,95.06 81.36,95.06
             81.36,95.06 75.06,97.76 75.06,97.76
             75.06,97.76 68.23,100.63 68.23,100.63
             68.23,100.63 63.91,102.97 63.91,102.97
             63.91,102.97 58.87,105.13 58.87,105.13
             58.87,105.13 53.66,107.83 53.66,107.83
             53.66,107.83 48.08,109.99 48.08,109.99
             48.08,109.99 44.30,111.07 44.30,111.07
             44.30,111.07 40.35,113.22 40.35,113.22
             40.35,113.22 36.39,115.56 36.39,115.56
             36.39,115.56 34.05,118.98 34.05,118.98
             34.05,118.98 33.33,122.04 33.33,122.04
             33.33,122.04 29.74,124.02 29.74,124.02
             29.74,124.02 27.04,127.79 27.04,127.79
             27.04,127.79 26.14,131.21 26.14,131.21
             26.14,131.21 24.88,134.63 24.88,134.63
             24.88,134.63 24.16,139.12 24.16,139.12
             24.16,139.12 23.08,142.90 23.08,142.90
             23.08,142.90 22.00,146.86 22.00,147.04
             22.00,147.22 20.20,151.89 20.20,151.89
             20.20,151.89 18.76,155.49 18.76,155.49
             18.76,155.49 16.61,158.19 16.61,158.19
             16.61,158.19 15.53,161.43 15.53,161.43
             15.53,161.43 13.19,165.56 13.19,165.56
             13.19,165.56 11.39,170.60 11.39,170.60
             11.39,170.60 9.77,176.18 9.77,176.18
             8.44,175.60 8.08,181.28 8.33,181.39
             8.33,181.39 8.33,187.69 8.33,187.69
             8.33,187.69 9.41,196.32 9.41,196.32
             9.41,196.32 10.49,201.18 10.49,201.36
             10.49,201.54 11.57,207.29 11.57,207.47
             11.57,207.65 11.93,211.79 11.93,211.79
             11.93,211.79 9.41,215.74 9.41,215.74
             9.41,215.74 7.97,220.06 7.97,220.06
             7.97,220.06 5.64,222.22 5.64,222.22
             5.64,222.22 2.04,226.18 2.04,226.18
             2.04,226.18 0.96,229.59 0.96,229.59
             0.96,229.59 1.32,233.19 1.32,233.19
             1.32,233.19 3.12,236.07 3.30,236.07
             3.48,236.07 5.64,237.87 5.81,237.87
             5.99,237.87 11.03,240.03 11.03,240.03
             11.03,240.03 15.71,242.18 15.71,242.18
             15.71,242.18 21.46,243.98 21.46,243.98
             21.46,243.98 25.06,244.70 25.24,244.70
             25.42,244.70 33.33,245.06 33.51,245.06
             33.69,245.06 37.47,245.42 37.47,245.42
             37.47,245.42 40.53,247.76 40.53,247.76
             40.53,247.76 42.33,249.74 42.33,249.74
             42.33,249.74 44.48,250.64 44.66,250.64
             44.84,250.64 49.52,250.82 49.52,250.82
             49.52,250.82 51.14,251.90 51.14,251.90
             51.14,251.90 52.58,253.33 52.58,253.33
             52.58,253.33 56.00,256.03 56.00,256.03
             56.00,256.03 59.23,258.37 59.23,258.37
             59.23,258.37 60.67,260.53 60.67,260.53
             60.67,260.53 64.09,262.33 64.09,262.33
             64.09,262.33 68.59,263.77 68.59,263.77
             68.59,263.77 72.36,264.31 72.36,264.31
             72.51,265.45 77.43,265.63 77.40,265.39
             77.40,265.39 81.18,265.57 81.18,265.57
             81.18,265.57 84.77,265.75 84.95,265.75
             85.13,265.75 88.55,266.10 88.55,266.10
             88.55,266.10 110.49,266.10 110.49,266.10
             110.49,266.10 115.53,263.95 115.53,263.95
             115.53,263.95 118.95,261.97 118.95,261.97
             118.95,261.97 122.18,259.81 122.18,259.81
             122.18,259.81 123.98,257.83 123.98,257.83
             123.98,257.83 127.04,255.67 127.04,255.67
             127.04,255.67 128.48,254.59 128.48,254.59
             128.48,254.59 135.49,254.95 135.49,254.95
             135.49,254.95 284.42,262.69 284.42,262.69
             284.42,262.69 287.29,266.28 287.29,266.28
             287.29,266.28 288.19,267.90 288.19,267.90
             288.19,267.90 290.89,268.98 290.89,268.98
             290.89,268.98 297.73,269.34 297.73,269.34
             297.73,269.34 316.79,270.06 316.79,270.06
             316.79,270.06 318.59,272.40 318.59,272.40
             318.59,272.40 321.65,275.28 321.65,275.28
             321.65,275.28 323.99,278.16 323.99,278.16
             323.99,278.16 327.22,280.13 327.22,280.13
             327.22,280.13 331.18,282.65 331.18,282.65
             331.18,282.65 336.76,285.35 336.76,285.35
             336.76,285.35 339.45,286.25 339.45,286.25
             339.45,286.25 344.67,287.15 344.67,287.15
             344.67,287.15 352.04,287.15 352.04,287.15
             352.04,287.15 358.16,287.51 358.16,287.51
             358.16,287.51 363.19,287.51 363.19,287.51
             363.19,287.51 376.32,287.51 376.32,287.51
             376.32,287.51 381.54,286.07 381.54,286.07
             381.54,286.07 388.91,281.57 388.91,281.57
             388.91,281.57 392.51,278.87 392.51,278.87
             392.51,278.87 396.11,273.84 396.11,273.84
             396.11,273.84 398.81,270.06 398.81,270.06
             398.81,270.06 401.50,265.75 401.50,265.75
             401.50,265.75 404.38,259.81 404.38,259.81
             404.38,259.81 407.62,253.15 407.62,253.15
             407.62,253.15 410.32,247.04 410.32,247.04
             410.32,247.04 411.40,242.72 411.40,242.72
             411.40,242.72 412.66,238.95 412.66,238.95
             412.66,238.95 419.85,236.97 419.85,236.97
             419.85,236.97 518.41,211.97 518.41,211.97
             518.41,211.97 519.31,216.82 519.31,216.82
             519.31,216.82 520.75,221.14 520.75,221.14
             520.75,221.14 523.63,224.92 523.63,224.92
             523.63,224.92 527.59,229.23 527.59,229.23
             527.59,229.23 531.36,230.67 531.36,230.67
             531.36,230.67 535.50,231.93 535.50,231.93
             535.50,231.93 539.46,232.65 539.46,232.65
             539.46,232.65 543.23,232.65 543.23,232.65
             543.23,232.65 550.43,233.19 550.43,233.19
             550.43,233.19 557.26,232.83 557.26,232.83
             557.26,232.83 563.74,233.01 563.74,233.01
             563.74,233.01 569.49,230.49 569.49,230.49
             569.49,230.49 573.45,225.28 573.45,225.28
             573.93,225.69 577.26,220.00 576.51,219.34
             576.51,219.34 578.49,214.49 578.49,214.49
             578.49,214.49 579.20,210.17 579.20,210.17
             579.20,210.17 580.10,204.23 580.10,204.23
             580.10,204.23 581.00,196.14 581.00,196.14
             581.00,196.14 582.08,191.10 582.08,191.10
             582.08,191.10 592.87,179.05 592.87,179.05
             592.87,179.05 593.77,176.89 593.77,176.89
             593.77,176.89 593.77,173.48 593.77,173.48
             593.77,173.48 593.23,170.06 593.23,170.06
             593.23,170.06 592.33,164.84 592.33,164.84
             592.33,164.84 592.33,158.01 592.33,158.01
             592.33,158.01 593.23,152.25 593.23,152.25
             593.23,152.25 594.85,143.98 594.85,143.98
             594.85,143.98 595.75,137.51 595.75,137.51
             595.75,137.51 595.57,131.57 595.57,131.57
             595.57,131.57 593.23,123.66 593.23,123.66
             593.23,123.66 592.51,118.62 592.51,118.62
             592.51,118.62 589.64,112.87 589.64,112.87
             589.64,112.87 588.92,109.99 588.92,109.99
             588.92,109.99 589.64,95.60 589.64,95.60
             589.64,95.60 590.00,89.66 590.00,89.66
             590.00,89.66 590.36,86.25 590.36,86.25
             590.36,86.25 588.74,83.73 588.74,83.73
             588.74,83.73 586.76,82.11 586.76,82.11
             586.76,82.11 584.06,81.39 584.06,81.39
             584.06,81.39 581.18,80.67 581.18,80.67
             581.18,80.67 578.67,77.61 578.67,77.61
             578.67,77.61 574.35,72.76 574.35,72.76
             574.35,72.76 570.21,68.62 570.21,68.62
             570.21,68.62 567.15,64.84 567.15,64.84
             567.15,64.84 563.20,60.53 563.20,60.53
             563.20,60.53 559.42,57.29 559.42,57.29
             559.42,57.29 556.18,54.41 556.18,54.41
             556.18,54.41 553.48,51.17 553.48,51.17
             553.48,51.17 547.73,46.50 547.73,46.50
             547.73,46.50 543.77,42.90 543.77,42.90
             543.77,42.90 540.71,40.38 540.71,40.38
             540.71,40.38 536.94,38.04 536.94,38.04
             536.94,38.04 531.90,33.73 531.90,33.73
             531.90,33.73 528.30,30.31 528.30,30.31
             528.30,30.31 524.53,28.33 524.53,28.33
             524.53,28.33 520.93,25.27 520.93,25.27
             520.93,25.27 517.15,22.76 517.15,22.76
             517.15,22.76 513.56,20.24 513.56,20.24
             513.56,20.24 509.78,18.26 509.78,18.26
             509.78,18.26 505.28,15.20 505.28,15.20
             505.28,15.20 500.79,12.86 500.79,12.86
             500.79,12.86 495.57,10.71 495.57,10.71
             495.57,10.71 488.02,8.01 488.02,8.01
             488.02,8.01 484.24,6.21 484.24,6.21
             484.24,6.21 479.38,4.23 479.38,4.23
             479.38,4.23 471.11,2.25 471.11,2.25
             471.11,2.25 465.35,1.71 465.35,1.71
             465.35,1.71 460.68,1.17 460.68,1.17
             460.68,1.17 404.02,0.81 404.02,0.81 Z`;
  private rectPathData = `M 0.73,0.73
  C 0.73,0.73 595.16,1.10 595.16,1.10
    595.16,1.10 594.79,286.96 594.79,286.96
    594.79,286.96 2.20,286.60 2.20,286.60
    2.20,286.60 0.73,0.73 0.73,0.73 Z`;

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
    this.nearThreshold.set(value);
  }

  setFarThreshold(value: number) {
    this.farThreshold.set(value);
  }

  // helper: create scaled Path2D and scales with margin (centered)
  private createScaledPath(
    d: string,
    canvasWidth: number,
    canvasHeight: number
  ) {
    const rawPath = new Path2D(d);

    // use 8% margins like your final HTML
    const marginX = canvasWidth * 0.08;
    const marginY = canvasHeight * 0.08;

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
    this.model = await cocoSsd.load({ base: 'mobilenet_v2' });
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

    const marcoResult = this.createScaledPath(this.carOutlinePathData, w, h);
    this.marcoPath = marcoResult.path;

    // redraw overlay with shapes
    this.overlayCtx.clearRect(0, 0, w, h);

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
    this.overlayCtx.lineWidth = 1;
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

      // draw reference rect
      if (this.showBoxes()) {
        this.overlayCtx.strokeStyle = 'rgba(255, 255, 0, 1)';
      } else {
        this.overlayCtx.strokeStyle = 'rgba(255, 255, 0 , 0)';
      }
      this.overlayCtx.lineWidth = 1;
      this.overlayCtx.stroke(this.rectPath);

      // irregular marco
      this.overlayCtx.strokeStyle = 'white';
      this.overlayCtx.lineWidth = 1;
      this.overlayCtx.setLineDash([]);
      this.overlayCtx.stroke(this.marcoPath);
      this.overlayCtx.restore();

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
    const photoCanvas = document.createElement('canvas');
    photoCanvas.width = this.videoRef.nativeElement.videoWidth;
    photoCanvas.height = this.videoRef.nativeElement.videoHeight;

    const ctx = photoCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(
        this.videoRef.nativeElement,
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
