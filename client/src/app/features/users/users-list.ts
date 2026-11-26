import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { InviteDto, UserDto, UserStatus } from '../../core/auth/dto';
import { toApiError, UsersApi } from '../../core/api/users-api';
import { AuthService } from '../../core/auth/auth.service';
import { BUTTON_DANGER_CONFIRM, BUTTON_SECONDARY } from '../../core/layout/buttons';
import { Modal } from '../../core/layout/modal';
import { STATUS_LABELS } from './user-status';
import { InvitePanel } from './invite-panel';

const STATUS_CLASSES: Record<UserStatus, string> = {
  active: 'bg-amber-50 text-amber-700',
  invited: 'bg-amber-50 text-amber-700',
  disabled: 'bg-stone-100 text-stone-500',
};

@Component({
  selector: 'app-users-list',
  imports: [RouterLink, DatePipe, InvitePanel, Modal],
  template: `
    <section class="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-stone-900">Utenti</h1>
          <p class="mt-1 text-sm text-stone-600">Le persone che possono accedere a Dimmelo.</p>
        </div>
        @if (canManage()) {
          <a
            routerLink="nuovo"
            class="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-800"
          >
            Nuovo utente
          </a>
        }
      </div>

      @if (error()) {
        <p
          class="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {{ error() }}
        </p>
      }

      @if (invite(); as i) {
        <div class="mt-6">
          <app-invite-panel [invite]="i.invite" [name]="i.name" (closed)="invite.set(null)" />
        </div>
      }

      @if (users.isLoading() && !users.hasValue()) {
        <p class="mt-8 text-stone-500">Caricamento…</p>
      } @else if (users.error()) {
        <p class="mt-8 text-red-700">Impossibile caricare gli utenti.</p>
      } @else {
        <ul
          class="mt-6 divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
        >
          @for (user of users.value() ?? []; track user.id) {
            <li
              class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
              [class.opacity-60]="user.status === 'disabled'"
            >
              <div class="flex min-w-0 flex-1 items-center gap-3">
                <span
                  class="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-800"
                  aria-hidden="true"
                >
                  {{ initials(user) }}
                </span>
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <a [routerLink]="[user.id]" class="font-medium text-stone-900 hover:underline">
                      {{ user.displayName }}
                    </a>
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-medium"
                      [class]="statusClasses[user.status]"
                    >
                      {{ statusLabels[user.status] }}
                    </span>
                    <span class="text-xs text-stone-500">{{ permissionSummary(user) }}</span>
                  </div>
                  <div class="mt-0.5 truncate text-sm text-stone-600">
                    {{ user.email }}
                  </div>
                  <div class="text-xs text-stone-400">
                    @if (user.lastLoginAt) {
                      Ultimo accesso {{ user.lastLoginAt | date: 'd MMM y, HH:mm' }}
                    } @else {
                      Non ha ancora effettuato l'accesso
                    }
                  </div>
                </div>
              </div>

              <div class="flex flex-wrap gap-2 text-sm sm:justify-end">
                @if (!canManageUser(user)) {
                  <a
                    [routerLink]="[user.id]"
                    class="rounded-md px-3 py-1.5 text-stone-700 hover:bg-stone-100"
                    >Dettagli</a
                  >
                } @else if (confirming() === user.id) {
                  <span class="self-center text-stone-600">Disattivare?</span>
                  <button
                    type="button"
                    class="rounded-md bg-red-600 px-3 py-1.5 text-white hover:bg-red-700"
                    [disabled]="busy()"
                    (click)="disable(user)"
                  >
                    Sì, disattiva
                  </button>
                  <button
                    type="button"
                    class="rounded-md px-3 py-1.5 text-stone-600 hover:bg-stone-100"
                    (click)="confirming.set(null)"
                  >
                    Annulla
                  </button>
                } @else {
                  <a
                    [routerLink]="[user.id]"
                    class="rounded-md px-3 py-1.5 text-stone-700 hover:bg-stone-100"
                    >Modifica</a
                  >
                  @if (user.status === 'disabled') {
                    <button
                      type="button"
                      class="rounded-md px-3 py-1.5 text-amber-700 hover:bg-amber-50"
                      [disabled]="busy()"
                      (click)="enable(user)"
                    >
                      Riattiva
                    </button>
                  } @else {
                    <button
                      type="button"
                      class="rounded-md px-3 py-1.5 text-amber-700 hover:bg-amber-50"
                      [disabled]="busy()"
                      (click)="newInvite(user)"
                    >
                      Invito
                    </button>
                    @if (user.id !== auth.user()?.id) {
                      <button
                        type="button"
                        class="rounded-md px-3 py-1.5 text-red-700 hover:bg-red-50"
                        (click)="confirming.set(user.id)"
                      >
                        Disattiva
                      </button>
                    }
                  }
                  @if (user.id !== auth.user()?.id) {
                    <button
                      type="button"
                      class="rounded-md px-3 py-1.5 text-red-700 hover:bg-red-50"
                      (click)="askDelete(user)"
                    >
                      Elimina
                    </button>
                  }
                }
              </div>
            </li>
          } @empty {
            <li class="p-6 text-center text-stone-500">Nessun utente.</li>
          }
        </ul>
      }

      @if (deleting(); as u) {
        <app-modal title="Eliminare l'utente?" (closed)="deleting.set(null)">
          <div class="space-y-3 text-sm text-stone-700">
            <p>
              <strong class="text-stone-900">{{ u.displayName }}</strong> ({{ u.email }}) non potrà
              più entrare in Dimmelo: si perdono i suoi permessi e le sessioni aperte.
            </p>
            <p>
              Il suo account di accesso e le passkey restano, perché possono servire alle altre
              app.
            </p>
            <p class="text-stone-500">
              Non si può annullare. Se deve solo smettere di entrare per un po', usa
              <em>Disattiva</em>.
            </p>
          </div>
          @if (deleteError()) {
            <p class="mt-3 text-sm text-red-700" role="alert">{{ deleteError() }}</p>
          }
          <div modal-footer class="flex flex-wrap justify-end gap-2">
            <button type="button" [class]="secondary" (click)="deleting.set(null)">Annulla</button>
            <button type="button" [class]="dangerConfirm" [disabled]="busy()" (click)="remove(u)">
              Sì, elimina
            </button>
          </div>
        </app-modal>
      }
    </section>
  `,
})
export class UsersList {
  protected readonly secondary = BUTTON_SECONDARY;
  protected readonly dangerConfirm = BUTTON_DANGER_CONFIRM;
  private readonly api = inject(UsersApi);
  protected readonly auth = inject(AuthService);
  protected readonly users = this.api.list();
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly statusClasses = STATUS_CLASSES;

  protected readonly invite = signal<{ invite: InviteDto; name: string } | null>(null);
  protected readonly confirming = signal<string | null>(null);
  /** Utente da eliminare, in attesa di conferma nella modale. */
  protected readonly deleting = signal<UserDto | null>(null);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly canManage = computed(() => this.auth.can('users.manage'));

  /**
   * Si gestisce solo chi ha permessi che si hanno anche (il backend controlla anche il resto).
   * I permessi assegnati e quelli dell'utente corrente sono già confrontabili: modificare
   * comprende vedere, e l'utente corrente ha anche quelli impliciti.
   */
  protected canManageUser(user: UserDto): boolean {
    return this.canManage() && user.permissions.every((p) => this.auth.can(p));
  }

  protected permissionSummary(user: UserDto): string {
    const n = user.permissions.length;
    return n === 0 ? 'Nessun permesso' : n === 1 ? '1 permesso' : `${n} permessi`;
  }

  protected initials(user: UserDto): string {
    return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  }

  protected newInvite(user: UserDto): Promise<void> {
    return this.run(async () => {
      this.invite.set({ invite: await this.api.invite(user.id), name: user.firstName });
    });
  }

  protected disable(user: UserDto): Promise<void> {
    return this.run(async () => {
      await this.api.disable(user.id);
      this.confirming.set(null);
      this.users.reload();
    });
  }

  protected askDelete(user: UserDto): void {
    this.deleteError.set(null);
    this.deleting.set(user);
  }

  protected async remove(user: UserDto): Promise<void> {
    this.busy.set(true);
    this.deleteError.set(null);
    try {
      await this.api.remove(user.id);
      this.deleting.set(null);
      this.users.reload();
    } catch (error) {
      this.deleteError.set(toApiError(error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected enable(user: UserDto): Promise<void> {
    return this.run(async () => {
      await this.api.enable(user.id);
      this.users.reload();
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
    } catch (error) {
      this.error.set(toApiError(error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
