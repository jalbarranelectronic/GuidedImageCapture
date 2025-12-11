import { Injectable } from '@angular/core';
import { TranslocoLoader } from '@ngneat/transloco';

@Injectable({ providedIn: 'root' })
export class TranslocoJsonLoader implements TranslocoLoader {
  getTranslation(lang: string) {
    return import(`../i18n/${lang}.json`).then((m) => m.default);
  }
}
