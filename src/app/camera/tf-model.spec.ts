import { TestBed } from '@angular/core/testing';

import { TfModel } from './tf-model';

describe('TfModel', () => {
  let service: TfModel;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TfModel);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
