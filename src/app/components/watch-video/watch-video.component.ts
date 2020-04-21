import { Component, OnInit, ViewEncapsulation, OnDestroy } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import * as moment from 'moment';
import { switchMap, takeUntil } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { User } from '../../services/user/state/user.model';
import { UserQuery } from '../../services/user/state/user.query';
import {
  fromVideoJS,
  Video,
  VideoJSON,
} from '../../services/video/state/video.model';
import { VideoService } from '../../services/video/state/video.service';
import { VideoStore } from '../../services/video/state/video.store';
import { downloadVideo } from '../../util/download';
import { generateVideoUrl } from '../../util/video-url-generator';
import { ComponentWithFollowButton } from '../../abstract-components/component-with-follow-button';
import { FollowService } from '../../services/follow.service';
import { VideoQuery } from '../../services/video/state/video.query';
import { Subject } from 'rxjs';

type Opinion = 'like' | 'dislike';

@Component({
  selector: 'app-watch-video',
  templateUrl: './watch-video.component.html',
  styleUrls: ['./watch-video.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class WatchVideoComponent extends ComponentWithFollowButton
  implements OnInit, OnDestroy {
  video: Video;
  likeRatio: number;
  link: string;
  facebookUrl: string;
  twitterUrl: string;

  private updated: boolean = false;

  watchVideoChanges$: Subject<any> = new Subject();

  constructor(
    private route: ActivatedRoute,
    private videoService: VideoService,
    private videoQuery: VideoQuery,
    private userQuery: UserQuery,
    private videoStore: VideoStore,
    private auth: AuthService,
    private snackbar: MatSnackBar,
    private titleService: Title,
    readonly followService: FollowService,
    readonly router: Router
  ) {
    super(followService, router);
  }

  ngOnInit(): void {
    this.setupVideoSubscriber();
    this.facebookUrl = `https://www.facebook.com/sharer/sharer.php?display=page&u=${document.location.href}&src=sdkpreparse`;
    this.twitterUrl = `https://twitter.com/intent/tweet?url=${document.location.href}`;
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.watchVideoChanges$.next();
    this.watchVideoChanges$.complete();
  }

  /**
   * Setup video stream
   */
  setupVideoSubscriber(): void {
    this.autoUnsubscribe(
      this.route.params.pipe(
        switchMap(({ id }) => this.videoQuery.selectVideo(id))
      )
    ).subscribe(async (video: Video) => {
      try {
        this.video = video;
        this.videoStore.setActive(this.video.id);

        // Set browser title
        this.titleService.setTitle(this.video.title);

        // Generate cloudfront link
        this.link = await generateVideoUrl(this.video.id);

        //Close subscription for previous video
        this.watchVideoChanges$.next();

        // Set video display information
        this.selectUsersAndSubscribe();
        this.likeRatio =
          this.video.likes.size /
          (this.video.likes.size + this.video.dislikes.size);

        // Update view count for video
        if (!this.updated) {
          this.videoService.updateVideo(this.video.id, {
            views: this.video.views + 1,
          });
          this.updated = true;
        }
      } catch (err) {
        console.error('Failed to retrieve video');
        console.error(err);
      }
    });
  }

  selectUsersAndSubscribe() {
    this.userQuery
      .selectUser(this.video.ownerRef)
      .pipe(takeUntil(this.watchVideoChanges$))
      .subscribe((owner) => (this.user = owner));

    this.userQuery
      .selectMyAccount()
      .pipe(takeUntil(this.watchVideoChanges$))
      .subscribe((me) => (this.me = me));
  }

  /**
   * Copy video link to clipboard
   */
  copy() {
    const el = document.createElement('textarea');
    el.value = document.location.href;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);

    this.snackbar.open('Copied!', 'Dismiss', {
      duration: 3000,
      horizontalPosition: 'left',
    });
  }

  /**
   * Update likes/dislikes for video on user action
   * @param type type of action (like/dislike)
   */
  async updateOpinion(type: Opinion): Promise<void> {
    if (!this.me) {
      return;
    }

    if (type === 'like' && !this.isLiked()) {
      const likes = this.video.likes.push(this.me.id);
      let dislikes = this.video.dislikes;

      // Remove dislike on like
      if (dislikes.includes(this.me.id)) {
        dislikes = dislikes.filter((dislike) => dislike !== this.me.id);
      }

      await this.videoService.updateVideo(this.video.id, {
        likes: likes.toArray(),
        dislikes: dislikes.toArray(),
      });
    } else if (type === 'dislike' && !this.isDisliked()) {
      const dislikes = this.video.dislikes.push(this.me.id);
      let likes = this.video.likes;

      // Remove like on dislike
      if (likes.includes(this.me.id)) {
        likes = likes.filter((like) => like !== this.me.id);
      }

      await this.videoService.updateVideo(this.video.id, {
        likes: likes.toArray(),
        dislikes: dislikes.toArray(),
      });
    }
  }

  isLiked(): boolean {
    return this.video.likes.includes(this.me?.id) ? true : false;
  }

  isDisliked(): boolean {
    return this.video.dislikes.includes(this.me?.id) ? true : false;
  }

  get description(): string {
    return this.video.description
      ? this.video.description
      : 'There is no description for this video';
  }

  get publishedDate(): string {
    const date = moment(this.video.createdAt);
    return date.format('DD MMM YYYY');
  }

  get tags(): string {
    let tagString = '';
    this.video.tags.forEach((tag, index) => {
      if (index === this.video.tags.size - 1) {
        tagString += `#${tag}.`;
      } else {
        tagString += `#${tag}, `;
      }
    });
    return tagString;
  }

  /**
   * Generate download link and invoke it to download
   */
  async download(): Promise<void> {
    if (!(await this.auth.isAuthenticated())) {
      this.router.navigate(['login']);
      return;
    }

    const url = await generateVideoUrl(this.video.id);
    downloadVideo(url, this.video.title);
  }

  get followButtonText(): string {
    return this.isFollowed ? 'Unfollow' : 'Follow';
  }
}
