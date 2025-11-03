import { Injectable, signal } from '@angular/core';

export interface AppConfig {
  variant: string;
  features: {
    showFramingArrows: boolean;
    enableObjectDetection: boolean;
    showPhotoConfirmation: boolean;
    showDetectionsPanel: boolean;
    enableAiAnalysisSimulation: boolean;
  };
}

@Injectable({ providedIn: 'root' })
export class ConfigService {
  config = signal<AppConfig | null>(null);

  constructor() {}

  async loadConfig() {
    try {
      const params = new URLSearchParams(window.location.search);
      const variant = params.get('variant') ?? 'dev';
      const url = `config/config-${variant}.json`;
      const response = await fetch(url);
      const cfg = await response.json();
      this.config.set(cfg);
      console.log('✅ Configuración cargada:', cfg);
    } catch (err) {
      console.error('❌ No se pudo cargar la configuración:', err);
    }
  }

  getFeature<K extends keyof AppConfig['features']>(key: K): boolean {
    return this.config()?.features[key] ?? false;
  }

  get variant() {
    return this.config()?.variant ?? 'default';
  }
}
