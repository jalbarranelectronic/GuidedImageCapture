import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class PhotoCaptureService {

  readonly captureWidth = 1920;
  readonly captureHeight = 1080;

  private readonly resolutionTimeoutMs = 1500;
  private readonly pollingIntervalMs = 50;

  async capture(
    stream: MediaStream,
    video: HTMLVideoElement
  ): Promise<string> {

    const blob = await this.captureAsBlob(
      stream,
      video
    );

    return this.blobToDataUrl(blob);
  }

  async captureAsBlob(
    stream: MediaStream,
    video: HTMLVideoElement
  ): Promise<Blob> {

    if (this.supportsImageCapture()) {

      try {

        console.log(
          '[PhotoCapture] Using ImageCapture API'
        );

        return await this.captureUsingImageCapture(
          stream
        );

      } catch (error) {

        console.warn(
          '[PhotoCapture] ImageCapture failed. Falling back to video capture.',
          error
        );

      }
    }

    return this.captureUsingVideoFallback(
      stream,
      video
    );
  }

  private supportsImageCapture(): boolean {

    return typeof (
      window as any
    ).ImageCapture !== 'undefined';
  }

  private async captureUsingImageCapture(
    stream: MediaStream
  ): Promise<Blob> {

    const track =
      stream.getVideoTracks()[0];

    const ImageCaptureCtor =
    (window as any).ImageCapture;

    const imageCapture =
      new ImageCaptureCtor(track);

    try {

      const capabilities = await imageCapture.getPhotoCapabilities();

      if (capabilities.imageWidth && capabilities.imageHeight) {

          return await imageCapture.takePhoto({

          imageWidth:
            capabilities.imageWidth.max,

          imageHeight:
            capabilities.imageHeight.max

        });
      }
    } finally {

      return await imageCapture.takePhoto();

    }
  }

  private async captureUsingVideoFallback(
    stream: MediaStream,
    video: HTMLVideoElement
  ): Promise<Blob> {

    const track =
      stream.getVideoTracks()[0];

    const originalSettings =
      track.getSettings();

    try {

      await this.switchToCaptureResolution(
        track,
        video
      );

      return await this.captureFrameAsBlob(
        video
      );

    } finally {

      await this.restorePreviewResolution(
        track,
        originalSettings,
        video
      );

    }
  }

  private async switchToCaptureResolution(
    track: MediaStreamTrack,
    video: HTMLVideoElement
  ): Promise<void> {

    await track.applyConstraints({

      width: {
        ideal: this.captureWidth,
      },

      height: {
        ideal: this.captureHeight,
      },

      frameRate: {
        ideal: 30,
      },

    });

    await this.waitForResolution(
      track,
      video,
      this.captureWidth,
      this.captureHeight
    );

    console.log(
      '[PhotoCapture] Capture resolution:',
      track.getSettings()
    );
  }

  private async restorePreviewResolution(
    track: MediaStreamTrack,
    originalSettings: MediaTrackSettings,
    video: HTMLVideoElement
  ): Promise<void> {

    try {

      await track.applyConstraints({

        width: {
          ideal: originalSettings.width,
        },

        height: {
          ideal: originalSettings.height,
        },

        frameRate: {
          ideal:
            originalSettings.frameRate ?? 30,
        },

      });

      if (
        originalSettings.width &&
        originalSettings.height
      ) {

        await this.waitForResolution(
          track,
          video,
          originalSettings.width,
          originalSettings.height
        );

      }

    } catch (error) {

      console.warn(
        '[PhotoCapture] Failed restoring preview resolution',
        error
      );

    }
  }

  /**
   * Espera hasta que tanto el track como el elemento
   * video reflejen la resolución esperada.
   */
  private async waitForResolution(
    track: MediaStreamTrack,
    video: HTMLVideoElement,
    expectedWidth: number,
    expectedHeight: number
  ): Promise<void> {

    const startTime = Date.now();

    while (
      Date.now() - startTime <
      this.resolutionTimeoutMs
    ) {

      const settings =
        track.getSettings();

      const trackReady =
        settings.width === expectedWidth &&
        settings.height === expectedHeight;

      const videoReady =
        video.videoWidth === expectedWidth &&
        video.videoHeight === expectedHeight;

      if (
        trackReady &&
        videoReady
      ) {

        return;

      }

      await this.delay(
        this.pollingIntervalMs
      );
    }

    console.warn(
      '[PhotoCapture] Resolution timeout',
      {
        expectedWidth,
        expectedHeight,
        actualTrack:
          track.getSettings(),
        actualVideo: {
          width: video.videoWidth,
          height: video.videoHeight,
        },
      }
    );
  }

  private async captureFrameAsBlob(
    video: HTMLVideoElement
  ): Promise<Blob> {

    const canvas =
      document.createElement('canvas');

    canvas.width =
      video.videoWidth;

    canvas.height =
      video.videoHeight;

    const ctx =
      canvas.getContext('2d');

    if (!ctx) {

      throw new Error(
        'Canvas context unavailable'
      );

    }

    ctx.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return new Promise<Blob>(
      (resolve, reject) => {

        canvas.toBlob(

          (blob) => {

            if (!blob) {

              reject(
                new Error(
                  'Failed to create image blob'
                )
              );

              return;
            }

            resolve(blob);

          },

          'image/jpeg',

          0.95

        );

      }
    );
  }

  blobToDataUrl(
    blob: Blob
  ): Promise<string> {

    return new Promise(
      (resolve, reject) => {

        const reader =
          new FileReader();

        reader.onloadend = () => {

          resolve(
            reader.result as string
          );

        };

        reader.onerror =
          reject;

        reader.readAsDataURL(
          blob
        );

      }
    );
  }

  private delay(
    ms: number
  ): Promise<void> {

    return new Promise(
      resolve =>
        setTimeout(
          resolve,
          ms
        )
    );
  }
}
