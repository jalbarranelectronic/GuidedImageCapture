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
  @ViewChild('bubble') bubbleRef!: ElementRef<HTMLDivElement>;
  status = signal('Level your mobile device...');
  statusColor = signal('red');

  private beta = 0;
  private gamma = 0;

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
    window.addEventListener('deviceorientation', (event) => {
      this.beta = event.beta ?? 0; // adelante/atrás
      this.gamma = event.gamma ?? 0; // izquierda/derecha
      this.beta = this.beta - 90;

      const bubble = this.bubbleRef.nativeElement;
      const maxOffset = 70;
      const x = Math.max(-maxOffset, Math.min(maxOffset, this.gamma * 2));
      const y = Math.max(-maxOffset, Math.min(maxOffset, this.beta * 2));

      bubble.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;

      if (Math.abs(this.beta) < 5 && Math.abs(this.gamma) < 5) {
        this.status.set('');
        this.statusColor.set('green');
      } else {
        this.status.set('❌');
        this.statusColor.set('red');
      }
    });
  }

  isPerpendicular(threshold = 10): boolean {
    return Math.abs(this.beta) < threshold && Math.abs(this.gamma) < threshold;
  }
}
