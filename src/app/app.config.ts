import {
  inject,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  provideAppInitializer,
} from '@angular/core';

import { ConfigService } from './services/config.service';
import { LanguageService } from './services/language.service';
import { routes } from './app.routes';

// Tu provider de traducción de Transloco:
import { provideTranslocoRoot } from './transloco/transloco.provider';
import { provideRouter } from '@angular/router';

export const appConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),

    // 🔥 Cargar configuraciones al inicio sin usar APP_INITIALIZER
    provideAppInitializer(async () => {
      const cfg = inject(ConfigService);
      const lang = inject(LanguageService);

      await cfg.loadConfig();
      await lang.initializeFromUrl();
    }),

    provideTranslocoRoot(),

    provideRouter(routes),
  ],
};
