import { translocoConfig, TranslocoConfig } from '@ngneat/transloco';

export const translocoGlobalConfig: TranslocoConfig = translocoConfig({
  availableLangs: ['es', 'en', 'pt'],
  defaultLang: 'en',
  reRenderOnLangChange: true,
  prodMode: false,
});
