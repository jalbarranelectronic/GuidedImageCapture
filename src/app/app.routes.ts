import { Routes } from '@angular/router';
import { languageFromRouteGuard } from './guards/language-from-route.guard';

export const routes: Routes = [
  {
    path: ':lang',
    canActivate: [languageFromRouteGuard],
    children: [
      {
        path: 'camera',
        loadComponent: () =>
          import('./camera/camera').then((m) => m.CameraComponent),
      },
      {
        path: '',
        redirectTo: 'camera',
        pathMatch: 'full',
      },
    ],
  },

  // Si el usuario entra sin idioma → redirigir a EN por defecto
  {
    path: '',
    redirectTo: 'en/camera',
    pathMatch: 'full',
  },

  // Not found
  {
    path: '**',
    redirectTo: 'en/camera',
  },
];
