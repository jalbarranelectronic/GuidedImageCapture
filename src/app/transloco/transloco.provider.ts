import { provideTransloco } from '@ngneat/transloco';
import { TranslocoJsonLoader } from './transloco.loader';
import { translocoGlobalConfig } from './transloco.config';

export function provideTranslocoRoot() {
  return provideTransloco({
    config: translocoGlobalConfig,
    loader: TranslocoJsonLoader,
  });
}
