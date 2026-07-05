import Input from '@/shared/components/Input'
import { FILM_FINISHES, FILM_MANUFACTURERS, FILM_COLORS } from '@/shared/constants'
import { composeMaterialName } from '../lib/material-name'

/**
 * Структурные поля плёнки/ламинации (запрос менеджера 05.07): производитель,
 * серия, ширина рулона, мат/глянец, цвет. Отображаемое название собирается
 * автоматически (предпросмотр внизу). Используется в MaterialForm и
 * MaterialEditModal.
 *
 * @param {object} value — { manufacturer, product_line, roll_width_m, finish, color }
 * @param {(key, val) => void} onChange
 */
export function FilmFields({ value, onChange }) {
  const preview = composeMaterialName(value)
  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <p className="text-xs font-medium text-text-muted">Параметры плёнки</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Input
            label="Производитель"
            id="film-manufacturer"
            list="film-manufacturers"
            value={value.manufacturer ?? ''}
            onChange={(e) => onChange('manufacturer', e.target.value)}
            placeholder="Orajet"
            autoFocus
          />
          <datalist id="film-manufacturers">
            {FILM_MANUFACTURERS.map((m) => <option key={m} value={m} />)}
          </datalist>
        </div>
        <Input
          label="Название / серия"
          id="film-product"
          value={value.product_line ?? ''}
          onChange={(e) => onChange('product_line', e.target.value)}
          placeholder="3640"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Input
            label="Цвет"
            id="film-color"
            list="film-colors"
            value={value.color ?? ''}
            onChange={(e) => onChange('color', e.target.value)}
            placeholder="Белая / Прозрачная"
          />
          <datalist id="film-colors">
            {FILM_COLORS.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <label htmlFor="film-finish" className="block text-sm font-medium text-text mb-1">Поверхность</label>
          <select
            id="film-finish"
            value={value.finish ?? ''}
            onChange={(e) => onChange('finish', e.target.value || null)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/50 min-h-[42px]"
          >
            <option value="">— не указан —</option>
            {Object.entries(FILM_FINISHES).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <Input
        label="Ширина рулона (м)"
        id="film-width"
        type="number"
        min="0"
        step="any"
        value={value.roll_width_m ?? ''}
        onChange={(e) => onChange('roll_width_m', e.target.value)}
        placeholder="1.26"
      />

      <p className="text-xs text-text-muted">
        Название соберётся как:{' '}
        <span className="font-medium text-text">{preview || '— заполните поля —'}</span>
      </p>
    </div>
  )
}
