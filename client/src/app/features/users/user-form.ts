import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type {
  CreateUserResponseDto,
  Permission,
  PermissionSectionDto,
  UserInputDto,
} from '../../core/auth/dto';
import { toApiError, UsersApi } from '../../core/api/users-api';
import { AuthService } from '../../core/auth/auth.service';
import { InvitePanel } from './invite-panel';
import { PermissionPicker } from './permission-picker';

const FIELD =
  'mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 shadow-sm focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 focus:outline-none';

/** Creazione (`/utenti/nuovo`) e modifica (`/utenti/:id`) di un utente. */
@Component({
  selector: 'app-user-form',
  imports: [ReactiveFormsModule, RouterLink, InvitePanel, PermissionPicker],
  template: `
    <section class="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <a routerLink="/utenti" class="text-sm text-stone-500 hover:text-stone-800">← Utenti</a>
      <h1 class="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
        {{ !id() ? 'Nuovo utente' : readonly() ? 'Utente' : 'Modifica utente' }}
      </h1>

      @if (created(); as c) {
        <div class="mt-6 space-y-4">
          <p class="text-stone-700">
            <strong>{{ c.user.displayName }}</strong> è stato aggiunto.
          </p>
          <app-invite-panel
            [invite]="c.invite"
            [name]="c.user.firstName"
            (closed)="router.navigateByUrl('/utenti')"
          />
          <div class="flex gap-3">
            <a
              routerLink="/utenti"
              class="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800"
            >
              Fatto
            </a>
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm text-stone-700 hover:bg-stone-100"
              (click)="reset()"
            >
              Aggiungi un altro utente
            </button>
          </div>
        </div>
      } @else {
        <form
          [formGroup]="form"
          (ngSubmit)="save()"
          class="mt-6 space-y-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm"
          novalidate
        >
          @if (error()) {
            <p
              class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {{ error() }}
            </p>
          }

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block text-sm font-medium text-stone-700">
              Nome
              <input formControlName="firstName" autocomplete="given-name" [class]="field" />
              @if (fieldError('firstName'); as e) {
                <span class="mt-1 block text-xs text-red-600">{{ e }}</span>
              }
            </label>
            <label class="block text-sm font-medium text-stone-700">
              Cognome
              <input formControlName="lastName" autocomplete="family-name" [class]="field" />
              @if (fieldError('lastName'); as e) {
                <span class="mt-1 block text-xs text-red-600">{{ e }}</span>
              }
            </label>
          </div>

          <fieldset>
            <legend class="text-sm font-semibold text-stone-900">Contatti</legend>
            <div class="mt-2 grid gap-4 sm:grid-cols-2">
              <label class="block text-sm font-medium text-stone-700">
                Email
                <input type="email" formControlName="email" autocomplete="email" [class]="field" />
                @if (fieldError('email'); as e) {
                  <span class="mt-1 block text-xs text-red-600">{{ e }}</span>
                }
              </label>
              <label class="block text-sm font-medium text-stone-700">
                Telefono <span class="font-normal text-stone-400">(facoltativo)</span>
                <input type="tel" formControlName="phone" autocomplete="tel" [class]="field" />
                @if (fieldError('phone'); as e) {
                  <span class="mt-1 block text-xs text-red-600">{{ e }}</span>
                }
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend class="text-sm font-semibold text-stone-900">Permessi</legend>
            <div class="mt-2">
              <app-permission-picker
                [catalog]="catalog()"
                [(isAdmin)]="isAdmin"
                [(permissions)]="permissions"
                [disabled]="readonly() || isSelf()"
                [canSetAdmin]="auth.isAdmin()"
                [assignableBy]="auth.isAdmin() ? null : (auth.user()?.permissions ?? [])"
              />
            </div>
            @if (isSelf()) {
              <p class="mt-2 text-xs text-stone-500">Non puoi cambiare i tuoi permessi.</p>
            }
            @if (fieldError('permissions'); as e) {
              <p class="mt-2 text-xs text-red-600">{{ e }}</p>
            }
          </fieldset>

          <div class="flex justify-end gap-3 border-t border-stone-100 pt-4">
            <a
              routerLink="/utenti"
              class="rounded-lg px-4 py-2 text-sm text-stone-700 hover:bg-stone-100"
              >{{ readonly() ? 'Indietro' : 'Annulla' }}</a
            >
            @if (!readonly()) {
              <button
                type="submit"
                class="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-800 disabled:opacity-60"
                [disabled]="saving()"
              >
                {{ saving() ? 'Salvataggio…' : id() ? 'Salva' : 'Crea e invita' }}
              </button>
            }
          </div>
        </form>
      }
    </section>
  `,
})
export class UserForm {
  /** Path param `:id` (assente in creazione). */
  readonly id = input<string>();

  private readonly api = inject(UsersApi);
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  protected readonly field = FIELD;
  /** Chi può solo vedere gli utenti apre la scheda in sola lettura. */
  protected readonly readonly = computed(() => !this.auth.can('users.manage'));

  protected readonly form = inject(NonNullableFormBuilder).group({
    firstName: ['', [Validators.required, Validators.maxLength(50)]],
    lastName: ['', [Validators.required, Validators.maxLength(50)]],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
  });
  protected readonly isAdmin = signal(false);
  protected readonly permissions = signal<Permission[]>([]);
  protected readonly catalog = signal<PermissionSectionDto[]>([]);

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly serverErrors = signal<Record<string, string>>({});
  protected readonly created = signal<CreateUserResponseDto | null>(null);
  protected readonly isSelf = signal(false);

  constructor() {
    void this.api.permissionCatalog().then(
      (c) => this.catalog.set(c),
      (e: unknown) => this.error.set(toApiError(e).message),
    );
    effect(() => {
      const id = this.id();
      if (id) void this.load(Number(id));
    });
  }

  protected fieldError(name: keyof UserInputDto): string | null {
    const server = this.serverErrors()[name];
    if (server) return server;
    if (name === 'isAdmin' || name === 'permissions') return null;
    const control = this.form.controls[name];
    if (!control.touched || control.valid) return null;
    if (control.hasError('required')) return 'Campo obbligatorio';
    if (control.hasError('email')) return 'Email non valida';
    if (control.hasError('maxlength')) return 'Massimo 50 caratteri';
    return 'Valore non valido';
  }

  protected async save(): Promise<void> {
    this.serverErrors.set({});
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const body: UserInputDto = {
      ...value,
      phone: value.phone.trim() || null,
      isAdmin: this.isAdmin(),
      permissions: this.permissions(),
    };
    this.saving.set(true);
    this.error.set(null);
    try {
      const id = this.id();
      if (id) {
        await this.api.update(Number(id), body);
        await this.router.navigateByUrl('/utenti');
      } else {
        this.created.set(await this.api.create(body));
      }
    } catch (error) {
      const apiError = toApiError(error);
      this.error.set(apiError.message);
      this.serverErrors.set(apiError.fields);
    } finally {
      this.saving.set(false);
    }
  }

  protected reset(): void {
    this.created.set(null);
    this.form.reset();
    this.isAdmin.set(false);
    this.permissions.set([]);
  }

  private async load(id: number): Promise<void> {
    try {
      const user = await this.api.get(id);
      this.form.setValue({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone ?? '',
      });
      this.isAdmin.set(user.isAdmin);
      this.permissions.set(user.permissions);
      this.isSelf.set(user.id === this.auth.user()?.id);
      if (this.readonly()) this.form.disable();
    } catch (error) {
      this.error.set(toApiError(error).message);
    }
  }
}
