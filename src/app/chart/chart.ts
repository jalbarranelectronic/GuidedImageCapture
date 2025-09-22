import {
  Component,
  ElementRef,
  ViewChild,
  input,
  AfterViewInit,
  effect,
} from '@angular/core';

@Component({
  selector: 'app-chart',
  standalone: true,
  templateUrl: './chart.html',
  styleUrl: './chart.css',
})
export class ChartComponent implements AfterViewInit {
  @ViewChild('proportionChart', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;
  // receive a signal value via input()
  newValue = input<number | null>(null);
  nearThreshold = input<number>(0.9);
  farThreshold = input<number>(0.7);

  private ctx!: CanvasRenderingContext2D;
  private history: number[] = [];
  private maxPoints = 50;

  private yMin = 0.5;
  private yMax = 1;

  private updateEffect = effect(() => {
    const val = this.newValue();
    if (val !== null && !Number.isNaN(val) && this.ctx) {
      this.updateChart(val);
    }
  });

  ngAfterViewInit() {
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
    this.drawAxes();
  }

  private drawAxes() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    const thresholds = [
      { value: this.farThreshold(), color: 'orange' },
      { value: this.nearThreshold(), color: 'red' },
    ];
    console.log(`${thresholds[0].value}, ${thresholds[1].value}`);
    thresholds.forEach((t) => {
      console.log(typeof t.value);
      const y = this.valueToY(t.value);
      // Línea de referencia
      this.ctx.beginPath();
      this.ctx.strokeStyle = t.color;
      this.ctx.setLineDash([4, 4]);
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(canvas.width, y);
      this.ctx.stroke();
      //Etiqueta con el valor del umbral
      this.ctx.setLineDash([]); // reset
      this.ctx.fillStyle = t.color;
      this.ctx.font = '12px Arial';
      this.ctx.fillText(t.value.toFixed(2), 5, y - 5);
    });
    this.ctx.setLineDash([]);
  }

  private valueToY(val: number): number {
    const canvas = this.canvasRef.nativeElement;
    const range = this.yMax - this.yMin;
    const clamped = Math.max(this.yMin, Math.min(this.yMax, val));
    return canvas.height - ((clamped - this.yMin) / range) * canvas.height;
  }

  private updateChart(value: number) {
    this.history.push(value);
    if (this.history.length > this.maxPoints) this.history.shift();

    // redraw axes (static)
    this.drawAxes();

    // draw line
    this.ctx.beginPath();
    this.ctx.strokeStyle = '#0ff';
    this.ctx.lineWidth = 2;

    this.history.forEach((val, i) => {
      const x = (i / (this.maxPoints - 1)) * this.canvasRef.nativeElement.width;
      const y = this.valueToY(val);
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    });

    this.ctx.stroke();
  }
}
