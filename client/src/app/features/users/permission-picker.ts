import { Component, computed, input, model } from '@angular/core';
import type { Permission, PermissionSectionDto } from '../../core/auth/dto';

/**
 * Permessi di un utente (ruoli del progetto Dimmelo su ZITADEL): per ogni sezione dell'app le
 * caselle dei suoi permessi (Vedere, Modificare…). Modificare comprende vedere: spuntarlo
 * spunta anche vedere, togliere vedere toglie anche modificare.
 */
@Component({
  selector: 'app-permission-picker',
  template: `
    <div class="overflow-hidden rounded-lg border border-stone-200">
      <table class="w-full text-sm">
        <tbody class="divide-y divide-stone-100">
          @for (section of catalog(); track section.key) {
            <tr>
              <th scope="row" class="w-1/3 px-3 py-2.5 text-left font-medium text-stone-800">
                {{ section.label }}
              </th>
              <td class="px-3 py-2.5">
                <div class="flex flex-wrap gap-x-5 gap-y-2">
                  @for (permission of section.permissions; track permission.key) {
                    <label
                      class="flex cursor-pointer items-center gap-2 text-stone-700 has-[:disabled]:cursor-not-allowed has-[:disabled]:text-stone-400"
                      [title]="permission.description"
                    >
                      <input
                        type="checkbox"
                        class="size-4 accent-amber-700"
                        [checked]="effective().has(permission.key)"
                        [disabled]="disabled() || !assignable(permission.key)"
                        (change)="toggle(permission.key)"
                      />
                      {{ permission.label }}
                    </label>
                  }
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class PermissionPicker {
  readonly catalog = input.required<PermissionSectionDto[]>();
  readonly permissions = model.required<Permission[]>();
  /** Tutto in sola lettura (es. i propri permessi, o chi può solo vedere). */
  readonly disabled = input(false);
  /** Permessi che chi modifica può assegnare (i suoi); `null` = tutti. */
  readonly assignableBy = input<readonly Permission[] | null>(null);

  private readonly implies = computed(() => {
    const map = new Map<Permission, Permission[]>();
    for (const section of this.catalog()) {
      for (const p of section.permissions) map.set(p.key, p.implies);
    }
    return map;
  });

  /** Permessi assegnati più quelli impliciti. */
  protected readonly effective = computed(() => this.expand(this.permissions()));

  protected assignable(permission: Permission): boolean {
    const own = this.assignableBy();
    return !own || own.includes(permission);
  }

  protected toggle(permission: Permission): void {
    const current = this.effective();
    if (current.has(permission)) {
      // togliendo un permesso si tolgono anche quelli che lo comprendono
      this.permissions.set(
        this.permissions().filter((p) => p !== permission && !this.expand([p]).has(permission)),
      );
    } else {
      this.permissions.set([...this.permissions(), permission]);
    }
  }

  private expand(granted: readonly Permission[]): Set<Permission> {
    const result = new Set<Permission>();
    const add = (p: Permission) => {
      if (result.has(p)) return;
      result.add(p);
      (this.implies().get(p) ?? []).forEach(add);
    };
    granted.forEach(add);
    return result;
  }
}
