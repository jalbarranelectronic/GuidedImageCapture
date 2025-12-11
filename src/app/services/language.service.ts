import { Injectable, signal } from '@angular/core';
import { TranslocoService } from '@ngneat/transloco';

export type AppLang = 'es' | 'en' | 'pt';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  currentLang = signal<AppLang>('en');

  constructor(private transloco: TranslocoService) {}

  initializeFromUrl(): Promise<void> {
    return new Promise((resolve) => {
      const lang = this.detectLangFromUrl();
      this.setLanguage(lang);
      console.log('✅ Idioma cargado:', lang);
      resolve();
    });
  }

  detectLangFromUrl(): AppLang {
    const [, lang] = window.location.pathname.split('/');
    if (lang === 'es' || lang === 'pt') return lang;
    return 'en';
  }

  setLanguage(lang: AppLang) {
    this.currentLang.set(lang);
    this.transloco.setActiveLang(lang);
  }
}
