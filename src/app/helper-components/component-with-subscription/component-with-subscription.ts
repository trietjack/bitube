import { OnDestroy } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

export class ComponentWithSubscription implements OnDestroy {
  readonly complete$ = new Subject();

  ngOnDestroy() {
    this.complete$.next();
    this.complete$.complete();
  }

  autoUnsubscribe(observable: Observable<any>) {
    return observable.pipe(takeUntil(this.complete$));
  }
}