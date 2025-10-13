import { Injectable, signal } from '@angular/core';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as tf from '@tensorflow/tfjs';

@Injectable({
  providedIn: 'root',
})
export class TfModel {
  private model: cocoSsd.ObjectDetection | null = null;
  isLoaded = signal(false);
  private worker: Worker | null = null;

  constructor() {
    // Iniciar carga asíncrona apenas se crea el servicio
    this.loadModelInBackground();
  }

  private async loadModelInBackground() {
    if (typeof Worker != 'undefined') {
      this.worker = new Worker(
        new URL('../workers/tf-model.worker', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = async ({ data }) => {
        if (data.status === 'loaded') {
          console.log('Woker pre-loaded the model. Loading locally...');
          this.model = await cocoSsd.load();
          this.isLoaded.set(true);
        } else if (data.status === 'error') {
          console.error('Error on worker:', data.error);
        }
      };

      this.worker.postMessage('start');
    } else {
      this.directLoad();
    }
  }

  private async directLoad() {
    this.model = await cocoSsd.load();
    this.isLoaded.set(true);
  }

  async getModelReady(): Promise<cocoSsd.ObjectDetection> {
    if (this.model) return this.model;

    while (!this.isLoaded()) {
      await new Promise((r) => setTimeout(r, 200));
    }

    return this.model!;
  }
}
