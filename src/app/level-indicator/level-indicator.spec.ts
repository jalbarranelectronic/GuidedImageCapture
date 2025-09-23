import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LevelIndicatorComponent } from './level-indicator';

describe('LevelIndicator', () => {
  let component: LevelIndicatorComponent;
  let fixture: ComponentFixture<LevelIndicatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LevelIndicatorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LevelIndicatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
