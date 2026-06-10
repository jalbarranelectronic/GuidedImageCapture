import { Injectable } from '@angular/core';

export interface CameraResolution {
  width: number;
  height: number;
}

@Injectable({
  providedIn: 'root',
})
export class CameraResolutionService {

  private readonly resolutionsToCheck: CameraResolution[] = [
    { width: 160, height: 120 },
    { width: 320, height: 180 }, // 180p
    { width: 320, height: 240 }, // QVGA
    { width: 640, height: 360 }, // 360p
    { width: 640, height: 480 }, // VGA
    { width: 768, height: 576 },
    { width: 1024, height: 576 },
    { width: 1280, height: 720 }, // HD/720p
    { width: 1280, height: 768 },
    { width: 1280, height: 800 },
    { width: 1280, height: 900 },
    { width: 1280, height: 1000 },
    { width: 1920, height: 1080 }, // Full HD/1080p
    { width: 1920, height: 1200 },
    { width: 2560, height: 1440 },
    { width: 3840, height: 2160 }, // Television 4K/2160p
    { width: 4096, height: 2160 }, // Cinema 4K
  ];

  async findMaximumResolution(
    facingMode: 'user' | 'environment' = 'environment'
  ): Promise<CameraResolution | null> {

    let left = 0;
    let right = this.resolutionsToCheck.length - 1;

    let bestResolution: CameraResolution | null = null;

    while (left <= right) {

      const mid = Math.floor((left + right) / 2);

      const resolution = this.resolutionsToCheck[mid];

      const supported = await this.testResolution(
        resolution,
        facingMode
      );

      if (supported) {
        bestResolution = resolution;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return bestResolution;
  }

  private async testResolution(
    resolution: CameraResolution,
    facingMode: 'user' | 'environment'
  ): Promise<boolean> {

    let stream: MediaStream | null = null;

    try {

      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode,
          width: {
            exact: resolution.width,
          },
          height: {
            exact: resolution.height,
          },
        },
      });

      return true;

    } catch {
      return false;

    } finally {

      stream?.getTracks().forEach(track => track.stop());

    }
  }
}
