import { Component, AfterViewInit, OnDestroy, ElementRef, ViewChild, signal } from '@angular/core';
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
  styleUrl: './camera.css'
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
  private carOutlinePathData = `m225.24178,18c0,0 -1.15224,-0.76537 -3,0c-1.30656,0.5412 -2.82443,0.09789 -4,2c-0.52573,0.85065 -1.07613,0.61732 -2,1c-1.30656,0.5412 -2.07613,1.61732 -3,2c-1.30656,0.5412 -2.29289,0.29289 -3,1c-0.70711,0.70711 -0.29289,1.29289 -1,2c-0.70711,0.70711 -1,1 -2,1c-1,0 -1.07613,0.61732 -2,1c-1.30656,0.5412 -2.61731,1.07612 -3,2c-0.5412,1.30656 -1.29289,1.29289 -2,2c-0.70711,0.70711 -1,1 -2,1c-1,0 -0.69344,1.45881 -2,2c-0.92387,0.38268 -1.29289,0.29289 -2,1c-0.70711,0.70711 -0.29289,1.29289 -1,2c-0.70711,0.70711 -1.29289,0.29289 -2,1c-0.70711,0.70711 -0.29289,1.29289 -1,2c-0.70711,0.70711 -1.29289,0.29289 -2,1c-0.70711,0.70711 -0.69344,2.45881 -2,3c-0.92387,0.38268 -1.07613,0.61732 -2,1c-1.30656,0.54119 -1.07613,1.61732 -2,2c-1.30656,0.54119 -1.69344,1.45881 -3,2c-0.92387,0.38268 -1.29289,1.29289 -2,2c-0.70711,0.70711 -2.29289,0.29289 -3,1c-0.70711,0.70711 -0.29289,1.29289 -1,2c-0.70711,0.70711 -1.29289,0.29289 -2,1c-0.70711,0.70711 -0.29289,1.29289 -1,2c-0.70711,0.70711 -1.29289,0.29289 -2,1c-0.70711,0.70711 -0.29289,1.29289 -1,2c-0.70711,0.70711 -1.29289,0.29289 -2,1c-0.70711,0.70711 -2,0 -3,0c-1,0 -2,0 -3,0c-1,0 -1.29289,-0.29289 -2,-1c-0.70711,-0.70711 -1.29289,-0.29289 -2,-1c-0.70711,-0.70711 -1,-1 -2,-1c-1,0 -2,0 -3,0c-1,0 -2,0 -3,0c-1,0 -2.29289,-0.70711 -3,0c-0.70711,0.70711 -0.61731,1.07612 -1,2c-0.5412,1.30656 -2,2 -2,3c0,1 0,2 0,3c0,1 -0.4588,1.69344 -1,3c-0.38269,0.92388 0,2 0,3c0,1 -1,1 -1,2c0,1 -1,1 -2,1c-1,0 -1.29289,0.29289 -2,1c-0.70711,0.70711 -2.07613,-0.38268 -3,0c-1.30656,0.5412 -2.07613,0.61732 -3,1c-1.30656,0.5412 -1.29289,1.29289 -2,2c-0.70711,0.70711 -2,1 -3,1c-1,0 -2,1 -3,1c-1,0 -1.69344,0.4588 -3,1c-0.92388,0.38268 -2.29289,-0.70711 -3,0c-0.70711,0.70711 -1,1 -2,1c-2,0 -2,1 -4,1c-1,0 -1.87856,0.49346 -5,1c-1.97417,0.32037 -2,1 -3,1c-1,0 -1.29289,0.29289 -2,1c-0.70711,0.70711 -2.29289,-0.70711 -3,0c-0.70711,0.70711 -0.29289,1.29289 -1,2c-0.70711,0.70711 -1.69344,0.4588 -3,1c-0.92388,0.38268 -1.15224,0.23463 -3,1c-1.30656,0.5412 -1.29289,1.29289 -2,2c-0.70711,0.70711 -1.69344,0.4588 -3,1c-0.92388,0.38268 -2,1 -3,1c-1,0 -1.29289,0.29289 -2,1c-0.70711,0.70711 -2,1 -3,1c-1,0 -1,1 -2,1c-1,0 -2.69344,0.4588 -4,1c-0.92388,0.38268 -3,1 -4,1c-1,0 -1.29289,0.29289 -2,1c-0.70711,0.70711 -1.69344,0.4588 -3,1c-0.92388,0.38268 -3.07612,0.61732 -4,1c-1.30656,0.5412 -3.69344,2.4588 -5,3c-0.92388,0.38268 -2.29289,0.29289 -3,1c-0.70711,0.70711 -0.29289,1.29289 -1,2c-0.70711,0.70711 -1,1 -2,1c-1,0 -1,1 -2,1c-1,0 -1.29289,0.29289 -2,1c-0.70711,0.70711 -1.07612,0.61732 -2,1c-1.30656,0.5412 -1.69344,1.4588 -3,2c-0.92388,0.38268 -1.29289,0.29289 -2,1c-0.70711,0.70711 -1.29289,0.29289 -2,1c-0.70711,0.70711 0,2 0,4c0,1 0.30656,2.4588 -1,3c-0.92388,0.38268 -1,1 -2,1c-1,0 -2.4588,-0.30656 -3,1c-0.38268,0.92388 -0.61732,2.07612 -1,3c-0.5412,1.30656 -2.4588,1.69344 -3,3c-0.38268,0.92387 0.38268,2.07613 0,3c-0.5412,1.30656 -1,2 -1,3c0,1 -0.29289,1.29289 -1,2c-1.41421,1.41422 0.70711,3.29289 0,4c-0.70711,0.70711 -0.29289,1.29289 -1,2c-0.70711,0.70711 -0.61732,1.07613 -1,2c-0.5412,1.30656 -1,2 -1,3c0,1 -0.4588,1.69344 -1,3c-0.38268,0.92387 0.38268,2.07613 0,3c-0.5412,1.30656 -0.61732,2.07613 -1,3c-0.5412,1.30656 -0.29289,2.29289 -1,3c-0.70711,0.70711 -1,1 -1,2c0,1 -1,1 -1,2c0,1 0.70711,2.29289 0,3c-0.70711,0.70711 -0.29289,1.29289 -1,2c-0.70711,0.70711 -1.29289,0.29289 -2,1c-0.70711,0.70711 0.70711,2.29289 0,3c-0.70711,0.70711 -1,1 -1,2c0,1 -1,2 -1,3c0,1 0.22975,2.02675 0,3c-0.51374,2.17625 -2,3 -2,5c0,1 -0.29289,1.29289 -1,2c-0.70711,0.70711 0,2 0,3c0,1 0,2 0,3c0,1 0,2 0,3c0,1 1,2 1,3c0,1 0.29289,1.29289 1,2c0.70711,0.70711 -0.70711,2.29289 0,3c0.70711,0.70711 1.29289,0.29289 2,1c0.70711,0.70711 0,2 0,3c0,1 0.70711,2.29289 0,3c-0.70711,0.70711 -1.29289,0.29289 -2,1c-0.70711,0.70711 -0.69344,2.4588 -2,3c-0.92388,0.38269 -1.29289,0.29289 -2,1c-0.70711,0.70711 -1,1 -1,2c0,1 -0.29289,1.29289 -1,2c-0.70711,0.70711 0,2 0,3c0,1 0.70711,2.29289 0,3c-0.70711,0.70711 -1.70711,1.29289 -1,2c0.70711,0.70711 1.4588,0.69344 2,2c0.38268,0.92387 0.29289,1.29289 1,2c0.70711,0.70711 2,0 3,0c1,0 1.29289,1.29289 2,2c0.70711,0.70711 1.61732,0.07613 2,1c0.5412,1.30656 1.29289,2.29289 2,3c0.70711,0.70711 2,0 3,0c1,0 1,1 2,1c1,0 2,0 3,0c1,0 1,1 2,1c1,0 2,0 3,0c1,0 2,0 3,0c1,0 2.29289,-0.70711 3,0c0.70711,0.70711 1.29289,1.29289 2,2c0.70711,0.70711 0.29289,1.29289 1,2c0.70711,0.70711 2.29289,-0.70711 3,0c0.70711,0.70711 0.29289,1.29289 1,2c0.70711,0.70711 2,0 3,0c1,0 1.29289,0.29289 2,1c0.70711,0.70711 1.29289,0.29289 2,1c0.70711,0.70711 1.29289,0.29289 2,1c0.70711,0.70711 1.29289,0.29289 2,1c0.70711,0.70711 1.29289,0.29289 2,1c0.70711,0.70711 0,2 1,2c1,0 0.29289,1.29291 1,2c0.70711,0.70709 1.29289,0.29291 2,1c0.70711,0.70709 1,1 2,1c1,0 1.69344,0.4588 3,1c0.92388,0.38269 1.29289,0.29291 2,1c0.70711,0.70709 2,0 3,0c1,0 2,0 3,0c1,0 1.69344,0.4588 3,1c0.92388,0.38269 1.69344,0.4588 3,1c0.92388,0.38269 2,1 3,1c1,0 1,1 2,1c1,0 2.29289,-0.70709 3,0c0.70711,0.70709 1,1 2,1c1,0 2.29289,-0.70709 3,0c0.70711,0.70709 1,1 2,1c1,0 2,0 3,0c1,0 3,0 4,0c1,0 1.29289,0.29291 2,1c0.70711,0.70709 2,0 3,0c1,0 2,0 3,0c1,0 2,0 3,0c1,0 1.29289,-0.29291 2,-1c1.41422,-1.41422 3.29289,-0.29291 4,-1c0.70711,-0.70709 0.29289,-1.29291 1,-2c0.70711,-0.70709 1.29289,-0.29291 2,-1c0.70711,-0.70709 0.29289,-1.29291 1,-2c0.70711,-0.70709 1.29289,-0.29291 2,-1c0.70711,-0.70709 1,-1 1,-2c0,-1 0.29289,-2.29291 1,-3c0.70711,-0.70711 2,0 3,0c1,0 3,1 5,1c1,0 2,1 4,1c2,0 4.69344,0.4588 6,1c0.92387,0.38269 2,0 3,0c1,0 2,1 3,1c1,0 2,0 3,0c1,0 2,0 4,0c2,0 3,0 4,0c1,0 2,0 3,0c1,0 2,0 3,0c1,0 2,0 3,0c1,0 2,0 3,0c1,0 2,0 3,0c1,0 2,0 3,0c1,0 2,0 3,0c1,0 2,0 3,0c1,0 2,0 3,0c1,0 2,0 3,0c1,0 2,0 3,0c2,0 3,0 4,0c2,0 3,0 4,0c1,0 2,0 3,0c1,0 2.29289,-0.70709 3,0c0.70711,0.70709 1,1 2,1c1,0 2,0 3,0c1,0 2,1 3,1c1,0 2.07613,-0.38269 3,0c1.30656,0.5412 2,1 3,1c1,0 2,0 3,0c1,0 3,0 4,0c1,0 2,0 4,0c1,0 2.58578,-1.41422 4,0c0.70711,0.70709 1,1 2,1c1,0 2.0535,-0.4595 4,0c2.17625,0.51373 6.72958,3.37866 8,4c7.24245,3.54218 10.69345,2.4588 12,3c0.92389,0.38269 2,0 3,0c1,0 1.29291,-1.29291 2,-2c0.70709,-0.70709 1.69345,-0.4588 3,-1c0.92389,-0.38269 1.29291,-0.29291 2,-1c0.70709,-0.70709 2,0 3,0c1,0 2,0 3,0c1,0 2,0 3,0c1,0 2,0 3,0c1,0 2.02676,-0.22977 3,0c2.17624,0.51373 3,1 4,1c1,0 2,0 3,0c1,0 2,0 3,0c1,0 4,0 6,0c1,0 3,1 4,1c1,0 1,1 2,1c1,0 1.29291,0.29291 2,1c0.70709,0.70709 2.07611,-0.38269 3,0c1.30655,0.5412 1.29291,1.29291 2,2c0.70709,0.70709 1.29291,0.29291 2,1c0.70709,0.70709 2.29291,0.29291 3,1c0.70709,0.70709 1.07611,1.61731 2,2c1.30655,0.5412 1.0979,1.82443 3,3c0.85065,0.52573 1,1 2,1c1,0 2,1 3,1c1,0 2.29291,-0.70709 3,0c0.70709,0.70709 1,1 2,1c1,0 1.69345,0.4588 3,1c0.92389,0.38269 2,0 3,0c2,0 3,0 4,0c1,0 2,0 3,0c1,0 2,1 3,1c1,0 2,0 3,0c1,0 2,0 3,0c1,0 2,0 3,0c1,0 1,1 2,1c1,0 2,0 3,0c1,0 2,0 3,0c1,0 2,0 3,0c1,0 2.29291,0.70709 3,0c0.70709,-0.70709 1,-1 2,-1c1,0 1.29291,-0.29291 2,-1c0.70709,-0.70709 1.29291,-0.29291 2,-1c1.41422,-1.41422 3.07611,-0.61731 4,-1c1.30655,-0.5412 1.69345,-1.4588 3,-2c0.92389,-0.38269 1.29291,-1.29291 2,-2c0.70709,-0.70709 2.29291,-0.29291 3,-1c0.70709,-0.70709 0.69345,-1.4588 2,-2c0.92389,-0.38269 1.29291,-0.29291 2,-1c0.70709,-0.70709 0.29291,-1.29291 1,-2c0.70709,-0.70709 1.29291,-0.29291 2,-1c0.70709,-0.70709 0.29291,-1.29291 1,-2c0.70709,-0.70709 0.47427,-1.14935 1,-2c1.17557,-1.9021 2.61731,-2.07611 3,-3c0.5412,-1.30655 2,-1 2,-2c0,-1 1,-1 1,-2c0,-1 -0.70709,-2.29291 0,-3c0.70709,-0.70709 1,-1 1,-2c0,-1 0,-2 0,-3c0,-1 -0.38269,-2.07613 0,-3c0.5412,-1.30656 1.4588,-1.69344 2,-3c0.38269,-0.92387 -0.70709,-2.29289 0,-3c0.70709,-0.70711 0.29291,-1.29289 1,-2c0.70709,-0.70711 2,-1 3,-1c1,0 3,-1 4,-1c1,0 2,0 3,0c1,0 2,0 3,0c1,0 3,-1 4,-1c1,0 2.15225,0.76537 4,0c1.30655,-0.5412 2.02676,-0.77025 3,-1c2.17624,-0.51375 4,-2 5,-2c1,0 1.29291,-0.29289 2,-1c0.70709,-0.70711 1.82376,-0.48625 4,-1c2.91974,-0.68925 5,0 6,0c1,0 1,-1 3,-1c1,0 2.93414,-0.14429 5,-1c2.92157,-1.21014 4,-2 5,-2c1,0 1.29291,-0.29289 2,-1c0.70709,-0.70711 2,0 3,0c1,0 2,-1 3,-1c1,0 3.07843,0.21014 6,-1c2.06586,-0.85571 3,-1 4,-1c1,0 2.29291,0.70711 3,0c0.70709,-0.70711 1,-1 2,-1c1,0 3.07611,0.38269 4,0c1.30655,-0.5412 2,-1 3,-1c1,0 1.69345,-0.4588 3,-1c0.92389,-0.38269 2,-1 3,-1c1,0 1.29291,-0.29289 2,-1c0.70709,-0.70711 2,0 3,-1c1,-1 2,-1 3,-1c1,0 2,0 3,0c1,0 2.87866,-2.12132 5,0c0.70709,0.70711 1.07611,0.61731 2,1c1.30658,0.5412 1.4588,2.69344 2,4c0.38269,0.92387 0.29291,1.29289 1,2c0.70709,0.70711 2.07611,1.61731 3,2c1.30658,0.5412 1,2 2,2c1,0 2.07611,-0.38269 3,0c1.30658,0.5412 1.29291,1.29289 2,2c0.70709,0.70711 1.69342,0.4588 3,1c0.92389,0.38269 2,1 3,1c1,0 2.29291,-0.70711 3,0c0.70709,0.70711 1.82373,1.48625 4,2c0.97327,0.22975 2,0 4,0c1,0 2,0 3,0c1,0 2,0 3,0c1,0 2,0 3,0c1,0 2,0 3,0c1,0 2.29291,0.70711 3,0c0.70709,-0.70711 1,-1 2,-2c1,-1 1.29291,-1.29289 2,-2c0.70709,-0.70711 1.4588,-0.69344 2,-2c0.38269,-0.92387 0.61731,-1.07613 1,-2c0.5412,-1.30656 1.29291,-2.29289 2,-3c0.70709,-0.70711 1.29291,-1.29289 2,-2c0.70709,-0.70711 1.4588,-0.69344 2,-2c0.38269,-0.92387 0.29291,-1.29289 1,-2c0.70709,-0.70711 1,-2 1,-3c0,-1 1,-1 1,-2c0,-1 0,-2 0,-3c0,-1 0,-2 0,-3c0,-1 0.4588,-1.69344 1,-3c0.38269,-0.92387 -0.38269,-2.07613 0,-3c0.5412,-1.30656 1.4588,-1.69344 2,-3c0.38269,-0.92387 1,-2 1,-3c0,-1 1,-2 1,-3c0,-1 0.29291,-2.29289 1,-3c0.70709,-0.70711 1,-1 1,-2c0,-1 1,-1 1,-2c0,-1 0.29291,-1.29289 1,-2c0.70709,-0.70711 0.29291,-1.29289 1,-2c0.70709,-0.70711 0.61731,-1.07613 1,-2c0.5412,-1.30656 1.29291,-1.29289 2,-2c0.70709,-0.70711 0,-2 0,-3c0,-1 0,-2 0,-3c0,-1 0,-2 0,-3c0,-1 0,-2 0,-3c0,-1 0,-2 0,-3c0,-1 0,-2 0,-3c0,-1 0,-2 0,-3c0,-1 0,-2 0,-3c0,-1 0,-2 0,-3c0,-1 0,-2 0,-3c0,-1 1,-1 1,-2c0,-1 1,-2 1,-3c0,-1 0,-2 0,-3c0,-1 0,-2 0,-3c0,-2 0,-3 0,-4c0,-1 0,-2 0,-3c0,-1 0,-2 0,-3c0,-1 -1,-1 -1,-2c0,-1 -0.4588,-1.69344 -1,-3c-0.38269,-0.92388 0,-2 0,-3c0,-1 -1,-1 -1,-2c0,-1 0,-2 0,-3c0,-1 -0.29291,-1.29289 -1,-2c-0.70709,-0.70711 0,-2 0,-3c0,-1 -0.29291,-1.29289 -1,-2c-0.70709,-0.70711 0,-2 0,-3c0,-1 0,-2 0,-3c0,-1 0,-2 0,-3c0,-1 0,-2 0,-3c0,-1 0,-2 0,-3c0,-1 0,-2 0,-3c0,-1 -0.29291,-1.29289 -1,-2c-0.70709,-0.70711 0.70709,-2.29289 0,-3c-0.70709,-0.70711 -1,-1 -2,-1c-1,0 -2,0 -3,0c-1,0 -2,0 -3,0c-1,0 -1.29291,-1.29289 -2,-2c-0.70709,-0.70711 -1.4588,-0.69344 -2,-2c-0.38269,-0.92388 -0.29291,-1.29289 -1,-2c-0.70709,-0.70711 -0.4588,-1.69344 -1,-3c-0.38269,-0.92388 -1,-1 -1,-2c0,-1 -0.29291,-1.29289 -1,-2c-0.70709,-0.70711 0.70709,-2.29289 0,-3c-0.70709,-0.70711 -1.95514,-0.54916 -3,-4c-0.28979,-0.95709 -0.61731,-2.07612 -1,-3c-0.5412,-1.30656 -2.29291,-1.29289 -3,-2c-0.70709,-0.70711 -0.61731,-2.07612 -1,-3c-0.5412,-1.30656 -2,-2 -3,-3c-1,-1 -2,-2 -3,-3c-1,-1 -2.29291,-1.29289 -3,-2c-0.70709,-0.70711 -1.4588,-0.69344 -2,-2c-0.38269,-0.92388 -1.29291,-0.29289 -2,-1c-0.70709,-0.70711 -1.29291,-1.29289 -2,-2c-0.70709,-0.70711 -0.29291,-1.29289 -1,-2c-0.70709,-0.70711 -1.69342,-1.45881 -3,-2c-0.92389,-0.38268 -2.29291,-0.29289 -3,-1c-0.70709,-0.70711 -1.29291,-1.29289 -2,-2c-0.70709,-0.70711 -0.29291,-1.29289 -1,-2c-0.70709,-0.70711 -1.29291,-0.29289 -2,-1c-0.70709,-0.70711 -1.29291,-0.29289 -2,-1c-0.70709,-0.70711 -0.69342,-1.4588 -2,-2c-0.92389,-0.38268 -1.69342,-1.4588 -3,-2c-0.92389,-0.38268 -1,-1 -2,-1c-1,0 -1.29291,-0.29289 -2,-1c-0.70709,-0.70711 -0.69342,-1.4588 -2,-2c-0.92389,-0.38268 -1.07611,-0.61732 -2,-1c-1.30658,-0.5412 -2.29291,-0.29289 -3,-1c-0.70709,-0.70711 -1.29291,-1.29289 -2,-2c-0.70709,-0.70711 -1.07611,-0.61732 -2,-1c-1.30658,-0.5412 -1.61731,-1.07612 -2,-2c-0.5412,-1.30656 -2.29291,-0.29289 -3,-1c-0.70709,-0.70711 -0.29291,-1.29289 -1,-2c-0.70709,-0.70711 -2,0 -3,-1c-1,-1 -1.69345,-1.4588 -3,-2c-0.92389,-0.38268 -2.69345,-1.4588 -4,-2c-0.92389,-0.38268 -1.82376,-0.48626 -4,-1c-0.97324,-0.22975 -1.29291,-0.29289 -2,-1c-0.70709,-0.70711 -2,-1 -3,-1c-1,0 -2.29291,0.70711 -3,0c-0.70709,-0.70711 -1,-1 -2,-1c-1,0 -2.07611,0.38268 -3,0c-1.30655,-0.5412 -2,-1 -3,-1c-1,0 -2.07611,0.38268 -3,0c-1.30655,-0.5412 -1.69345,-1.4588 -3,-2c-0.92389,-0.38268 -2,0 -3,0c-2,0 -4.69345,-0.4588 -6,-1c-2.77164,-1.14805 -4,0 -5,0c-1,0 -2,0 -5,0c-4,0 -6,0 -7,0c-2,0 -4,0 -5,0c-1,0 -5,0 -7,0c-2,0 -3,0 -4,0c-1,0 -2,0 -3,0c-1,0 -2,0 -3,0c-1,0 -3,1 -5,1c-2,0 -3,0 -4,0c-1,0 -2,0 -3,0c-2,0 -4,0 -5,0c-2,0 -4,0 -6,0c-1,0 -2,0 -6,0c-2,0 -6.02582,-0.32036 -8,0c-3.12143,0.50654 -6,1 -9,1c-1,0 -2,0 -4,0c-1,0 -3,0 -5,0c-1,0 -2,0 -3,0c-1,0 -2,0 -3,0c-1,0 -2,0 -7,0c-1,0 -3,0 -5,0c-1,0 -2,0 -3,0c-1,0 -2,0 -3,0c-1,0 -2,0 -3,0c-1,0 -2,0 -4,0c-6,0 -9,0 -15,0c-2,0 -5,0 -7,0c-1,0 -2,0 -3,0c-2,0 -4,0 -7,0c-1,0 -3,0 -4,0c-1,0 -1,1 -2,1c-1,0 -2,0 -3,0c-1,0 -2,0 -4,0c-2,0 -6,0 -8,0c-2,0 -3,0 -5,0c-1,0 -3,0 -5,0c-2,0 -6,0 -7,0c-4,0 -5,1 -6,1c-1,0 -2.02676,-0.22975 -3,0c-2.17624,0.51374 -3,1 -4,1c-2,0 -3,0 -4,0c-1,0 -1.29289,0.29289 -2,1c-0.70711,0.70711 -2,0 -3,0c-1,0 -2,1 -3,1c-1,0 -2.61731,0.07612 -3,1c-0.5412,1.30656 -2.58578,-0.41421 -4,1c-0.70711,0.70711 -0.69344,1.4588 -2,2c-0.92387,0.38268 -1.29289,0.29289 -2,1c-0.70711,0.70711 -0.29289,1.29289 -1,2c-0.70711,0.70711 -1,1 -2,1c-1,0 -0.69344,1.4588 -2,2c-0.92387,0.38268 -1,1 -2,1c-1,0 -3,1 -4,2l-2,0l0,1`;
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
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }});
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
      this.stream.getTracks().forEach(t => t.stop());
    }
  }

  // helper: create scaled Path2D and scales with margin (centered)
  private createScaledPath(d: string, canvasWidth: number, canvasHeight: number) {
    const rawPath = new Path2D(d);

    // use 5% margins like your final HTML
    const marginX = canvasWidth * 0.05;
    const marginY = canvasHeight * 0.05;

    const availableWidth = canvasWidth - 2 * marginX;
    const availableHeight = canvasHeight - 2 * marginY;

    const scaleX = availableWidth / this.svgWidth;
    const scaleY = availableHeight / this.svgHeight;

    const scaledWidth = this.svgWidth * scaleX;
    const scaledHeight = this.svgHeight * scaleY;

    // center within the available area
    const offsetX = marginX + (availableWidth - scaledWidth) / 2;
    const offsetY = marginY + (availableHeight - scaledHeight) / 2;

    const transformed = new Path2D();
    transformed.addPath(rawPath, new DOMMatrix().translate(offsetX, offsetY).scale(scaleX, scaleY));

    return { path: transformed, scaleX, scaleY, offsetX, offsetY, scaledWidth, scaledHeight };
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
      await((document.documentElement as any).requestFullScreen?.() ||
        (document.documentElement as any).webkitRequestFullscreen?.() ||
        (document.documentElement as any).mozRequestFullScreen?.() ||
        (document.documentElement as any).msRequestFullscreen?.());
    } catch (err) {
      console.warn("Can't force fullscreen/orientation:", err);
    }
  }

  private async initCameraAndCanvases() {
    if (!this.stream) {
      this.feedback.set("❌ No camera stream.");
      return;
    }
    const video = this.videoRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;
    const overlayCanvas = this.overlayCanvasRef.nativeElement;

    video.srcObject = this.stream;

    await new Promise<void>(resolve => {
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
    // yellow rect
    this.overlayCtx.strokeStyle = 'yellow';
    this.overlayCtx.lineWidth = 3;
    this.overlayCtx.setLineDash([]);
    this.overlayCtx.stroke(this.rectPath);
    // irregular marco
    this.overlayCtx.strokeStyle = 'lime';
    this.overlayCtx.lineWidth = 4;
    this.overlayCtx.setLineDash([10, 6]);
    this.overlayCtx.stroke(this.marcoPath);
    this.overlayCtx.setLineDash([]);
  }

  private runDetectionLoop() {
    const canvas = this.canvasRef.nativeElement;
    const overlayCanvas = this.overlayCanvasRef.nativeElement;
    const video = this.videoRef.nativeElement;

    this.detectionTimer = setInterval(async () => {
      // draw current frame to hidden canvas
      this.ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const predictions = await this.model.detect(canvas);
      this.detections.set(predictions.map(p => `${p.class} (${(p.score*100).toFixed(1)}%)`));

      // clear overlay and redraw reference shapes
      this.overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      // draw rect and marco
      this.overlayCtx.strokeStyle = 'yellow';
      this.overlayCtx.lineWidth = 3;
      this.overlayCtx.setLineDash([]);
      this.overlayCtx.stroke(this.rectPath);

      this.overlayCtx.strokeStyle = 'lime';
      this.overlayCtx.lineWidth = 4;
      this.overlayCtx.setLineDash([10, 6]);
      this.overlayCtx.stroke(this.marcoPath);
      this.overlayCtx.setLineDash([]);

      // draw detections
      predictions.forEach(p => {
        const [x, y, w, h] = p.bbox;
        this.overlayCtx.strokeStyle = 'red';
        this.overlayCtx.lineWidth = 2;
        this.overlayCtx.strokeRect(x, y, w, h);
        this.overlayCtx.fillStyle = 'red';
        this.overlayCtx.font = '16px monospace';
        const labelY = y > 20 ? y - 6 : y + 16;
        this.overlayCtx.fillText(`${p.class} ${(p.score*100).toFixed(1)}%`, x, labelY);
      });

      // check car-like classes
      const car = predictions.find(p => ['car', 'truck', 'bus'].includes(p.class));
      if (car) {
        const [x, y, w, h] = car.bbox;
        // test if bbox corners inside rectPath
        const dentro = [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].every(([px,py]) => this.overlayCtx.isPointInPath(this.rectPath, px, py));

        // compute areas: car area vs scaled rect area (use rectScale values)
        const carArea = w * h;
        const rectArea = (this.svgWidth * this.rectScaleX) * (this.svgHeight * this.rectScaleY);
        const proportion = carArea / rectArea;
        this.proportion.set(+proportion.toFixed(3));

        const prop = proportion;
        if (!dentro || prop > 0.5) {
          this.feedback.set('Adjust the framing or step back a little. 🚗⬅️');
        } else if (prop < 0.35) {
          this.feedback.set("You're too far 🚗➡️");
        } else {
          this.feedback.set('Perfect! 📸');
        }
      } else {
        this.feedback.set('I cannot detect the car, adjust the framing.');
        this.proportion.set(null);
      }
    }, 1000);
  }
}
