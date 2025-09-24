import {
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  signal,
} from '@angular/core';

@Component({
  selector: 'app-level-indicator',
  imports: [],
  templateUrl: './level-indicator.html',
  styleUrl: './level-indicator.css',
})
export class LevelIndicatorComponent implements OnInit {
  @ViewChild('level', { static: true }) levelRef!: ElementRef<HTMLDivElement>;
  @ViewChild('bubble', { static: true }) bubbleRef!: ElementRef<HTMLDivElement>;

  status = signal('Level your mobile device...');
  statusColor = signal('red');

  ngOnInit() {
    // 📱 Pedir permiso en iOS
    document.body.addEventListener(
      'click',
      () => {
        if (
          typeof DeviceMotionEvent !== 'undefined' &&
          typeof (DeviceMotionEvent as any).requestPermission === 'function'
        ) {
          (DeviceMotionEvent as any).requestPermission().catch(console.error);
        }
      },
      { once: true }
    );

    // 🎛️ Escuchar orientación del dispositivo
    window.addEventListener('deviceorientation', (event) =>
      this.onDeviceOrientation(event)
    );
  }

  private onDeviceOrientation(evt: DeviceOrientationEvent) {
    const beta = evt.beta ?? 0; // adelante/atrás
    const gamma = evt.gamma ?? 0; // izquierda/derecha

    // Ajustar: cámara apuntando al frente → beta ≈ 90
    const adjustedBeta = beta - 90;

    const levelEl = this.levelRef?.nativeElement;
    const bubbleEl = this.bubbleRef?.nativeElement;
    if (!levelEl || !bubbleEl) return;

    const size = levelEl.offsetWidth;
    const bubbleSize = bubbleEl.offsetWidth;
    const maxOffset = (size - bubbleSize) / 2;

    // factor para controlar sensibilidad
    const factor = 2;

    const x = Math.max(-maxOffset, Math.min(maxOffset, gamma * factor));
    const y = Math.max(-maxOffset, Math.min(maxOffset, adjustedBeta * factor));

    bubbleEl.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;

    // criterio: burbuja dentro del círculo → nivelado
    const distance = Math.sqrt(x * x + y * y);
    if (distance < maxOffset) {
      this.status.set('✅ Cámara nivelada');
      this.statusColor.set('green');
    } else {
      this.status.set('❌ Ajusta el móvil...');
      this.statusColor.set('red');
    }
  }

  isPerpendicular(threshold = 10): boolean {
    const levelEl = this.levelRef?.nativeElement;
    const bubbleEl = this.bubbleRef?.nativeElement;
    if (!levelEl || !bubbleEl) return false;

    const lb = levelEl.getBoundingClientRect();
    const bb = bubbleEl.getBoundingClientRect();

    const cxLevel = lb.left + lb.width / 2;
    const cyLevel = lb.top + lb.height / 2;
    const cxBubble = bb.left + bb.width / 2;
    const cyBubble = bb.top + bb.height / 2;

    const dx = cxBubble - cxLevel;
    const dy = cyBubble - cyLevel;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const radius = (levelEl.offsetWidth - bubbleEl.offsetWidth) / 2;
    return dist <= radius;
  }
}
