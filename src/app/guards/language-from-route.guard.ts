import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LanguageService, AppLang } from '../services/language.service';

const validLangs: AppLang[] = ['es', 'en', 'pt'];

export const languageFromRouteGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const languageService = inject(LanguageService);

  const langParam = route.params['lang'];

  // Validar que exista
  if (!langParam || !validLangs.includes(langParam as AppLang)) {
    return router.parseUrl('/en/camera');
  }

  // Establecer idioma durante inicialización
  languageService.setLanguage(langParam as AppLang);

  return true;
};
