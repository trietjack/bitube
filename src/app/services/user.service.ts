import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/auth';
import { take } from 'rxjs/operators';
import { AngularFirestore } from '@angular/fire/firestore';
import { fromJS, UserJSON, User } from '../models/user.model';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  constructor(
    private firebaseAuth: AngularFireAuth,
    private firestore: AngularFirestore
  ) {}

  async getMyAccount(): Promise<User> {
    const googleAuthAccount = await this.firebaseAuth.authState
      .pipe(take(1))
      .toPromise();
    return this.getUser(googleAuthAccount.uid);
  }

  async getUser(id: String): Promise<User> {
    const docs = await this.firestore
      .collection<UserJSON>('users')
      .ref.where('id', '==', id)
      .get();
    const user = docs.docs[0].data();
    return fromJS(user as any);
  }
}
