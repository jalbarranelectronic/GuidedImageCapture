import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LevelIndicator } from './level-indicator';

describe('LevelIndicator', () => {
  let component: LevelIndicator;
  let fixture: ComponentFixture<LevelIndicator>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LevelIndicator]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LevelIndicator);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
