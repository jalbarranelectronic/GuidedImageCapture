import { Component, signal } from '@angular/core';
import { CameraComponent } from './camera/camera';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CameraComponent],
  template: `<app-camera></app-camera>`
})
export class App {
  protected readonly title = signal('guided-image-capture');
}
