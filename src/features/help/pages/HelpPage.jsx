import { useState } from 'react'
import Tabs from '@/shared/components/Tabs'

const HELP_TABS = [
  { key: 'overview', label: 'Обзор' },
  { key: 'stages', label: 'Этапы' },
  { key: 'roles', label: 'Роли' },
  { key: 'reports', label: 'Отчёты' },
  { key: 'faq', label: 'Вопросы' },
]

function Section({ title, children }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
      <h2 className="font-semibold text-lg">{title}</h2>
      {children}
    </div>
  )
}

function OverviewTab() {
  return (
    <div className="space-y-4">
      <Section title="Что такое Kontora24?">
        <p className="text-sm text-text-muted">
          Kontora24 — система управления стикерным производством. Здесь отслеживаются заказы
          от поступления до выдачи, фиксируется вклад каждого сотрудника, учитывается расход
          материалов и ведётся аналитика.
        </p>
      </Section>

      <Section title="Как начать работу">
        <ol className="text-sm text-text-muted space-y-2 list-decimal list-inside">
          <li>Откройте <strong>Личный кабинет</strong> и нажмите «Начать смену»</li>
          <li>Перейдите на <strong>Главную</strong> — там отображаются ваши задачи</li>
          <li>Нажмите на заказ, чтобы открыть его карточку</li>
          <li>Во вкладке <strong>Отчёты</strong> внесите свой вклад (напечатано, залито и т.д.)</li>
          <li>Когда количество достигнет тиража — заказ автоматически перейдёт на следующий этап</li>
          <li>В конце смены нажмите «Завершить смену» в Личном кабинете</li>
        </ol>
      </Section>

      <Section title="Навигация">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="bg-surface-dim rounded-lg p-3">
            <p className="font-medium">Главная</p>
            <p className="text-text-muted text-xs">Ваши задачи и общая сводка</p>
          </div>
          <div className="bg-surface-dim rounded-lg p-3">
            <p className="font-medium">Производство</p>
            <p className="text-text-muted text-xs">Канбан-доска со всеми заказами</p>
          </div>
          <div className="bg-surface-dim rounded-lg p-3">
            <p className="font-medium">Очереди</p>
            <p className="text-text-muted text-xs">Заказы по конкретному этапу</p>
          </div>
          <div className="bg-surface-dim rounded-lg p-3">
            <p className="font-medium">Личный кабинет</p>
            <p className="text-text-muted text-xs">Смены, статистика, ваш вклад</p>
          </div>
        </div>
      </Section>
    </div>
  )
}

function StagesTab() {
  const stages = [
    { name: 'Дизайн', desc: 'Дизайнер создаёт макет стикеров в Illustrator/Photoshop', who: 'Дизайнер', time: '15 мин — 2 ч' },
    { name: 'Печать', desc: 'Печатник загружает файл в плоттер и печатает на плёнке', who: 'Печатник', time: '10 — 30 мин', report: 'Стикеров напечатано, фонов напечатано, метраж плёнки, тип плёнки' },
    { name: 'Постобработка', desc: 'Плоттерная резка (die cut / kiss cut), ламинация', who: 'Печатник / Сборщик', time: '10 — 60 мин' },
    { name: 'Заливка смолой', desc: 'Заливка эпоксидной смолой + сушка 24 ч. Только для 3D заказов', who: 'Заливщик', time: '15 мин + 24 ч сушка', report: 'Стикеров залито, хороших после ОТК, расход смолы (г)' },
    { name: 'Сборка', desc: 'Выборка стикеров и сборка стикерпаков', who: 'Сборщик', time: '10 — 30 мин', report: 'Стикерпаков выбрано, стикерпаков собрано' },
    { name: 'Упаковка', desc: 'Упаковка готовых паков в пакеты/коробки', who: 'Сборщик', time: '5 — 10 мин', report: 'Паков упаковано' },
    { name: 'ОТК / Выдача', desc: 'Финальная проверка качества и выдача заказа клиенту', who: 'Администратор', time: '5 — 15 мин' },
  ]

  return (
    <div className="space-y-3">
      {stages.map((s, i) => (
        <div key={i} className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-2">
            <span className="w-7 h-7 rounded-full bg-accent/15 text-accent flex items-center justify-center text-sm font-bold">{i + 1}</span>
            <h3 className="font-semibold">{s.name}</h3>
          </div>
          <p className="text-sm text-text-muted mb-2">{s.desc}</p>
          <div className="flex flex-wrap gap-4 text-xs text-text-muted">
            <span>Кто: <strong className="text-text">{s.who}</strong></span>
            <span>Время: <strong className="text-text">{s.time}</strong></span>
          </div>
          {s.report && (
            <div className="mt-2 bg-surface-dim rounded-lg p-2 text-xs text-text-muted">
              Отчёт: {s.report}
            </div>
          )}
        </div>
      ))}

      <Section title="Автоматический переход">
        <p className="text-sm text-text-muted">
          Когда суммарное количество по отчётам достигает тиража заказа,
          система автоматически переводит заказ на следующий этап.
          Также можно вручную сдвинуть статус кнопкой на карточке заказа.
        </p>
      </Section>
    </div>
  )
}

function RolesTab() {
  const roles = [
    {
      name: 'Администратор',
      desc: 'Технический аккаунт владельца. В ежедневной работе не используется',
      can: [
        'Управление пользователями и настройки системы',
        'Доступ ко всем разделам: отчёты, бонусы, импорт, интеграция с Bitrix24',
        'Может встать на любой этап производства, если нужно подменить работника',
        'Используется для администрирования портала, не для рутины',
      ],
    },
    {
      name: 'Менеджер (руководитель производства)',
      desc: 'Приём заказов, контроль производства, ОТК и выдача',
      can: [
        'Создание и редактирование заказов, ввод данных по сделке из Bitrix24',
        'Работа с клиентами и складом материалов',
        'Аналитика по заказам, выручке и загрузке производства',
        'Видит цены, себестоимость и оплату',
        'Может передвигать любые статусы и отменять заказы',
        'ОТК и выдача готового заказа клиенту',
      ],
    },
    {
      name: 'Дизайнер',
      desc: 'Разработка макетов и допечатная подготовка',
      can: [
        'Берёт заказы со стадии «Дизайн» и «Препресс»',
        'Прикладывает ссылку на готовый макет (mockup_path)',
        'Делает цветокоррекцию, раскладку на лист, экспорт для плоттера',
        'Передвигает заказы Дизайн → Препресс → Печать',
        'Видит свою статистику в Кабинете',
        'НЕ видит цены и финансы',
      ],
    },
    {
      name: 'Печатник',
      desc: 'Печать, ламинация, резка. Помогает на постпечати когда свободен',
      can: [
        'Берёт заказы со стадий «Печать», «Ламинация», «Резка»',
        'Вносит расход плёнки (м), краски, ламинации, брак',
        'Может зайти в Препресс для согласования макета',
        'Помогает постпечатникам на «Заливке», «Выборке», «Сборке 3D», «Упаковке»',
        'Видит свою статистику в Кабинете',
        'НЕ видит цены и финансы',
      ],
    },
    {
      name: 'Постпечатник',
      desc: 'Заливка смолой, выборка, сборка 3D стикерпаков, упаковка',
      can: [
        'Берёт заказы со стадий «Заливка», «Выборка / Заливка», «Сборка 3D», «Упаковка»',
        'Вносит количество залитых/хороших стикеров и граммы смолы',
        'Учитывает брак (пузыри, неровности при заливке)',
        'Собирает 3D стикерпаки (стикеры на фоны) и упаковывает готовое',
        'Видит свою статистику в Кабинете',
        'НЕ видит цены и финансы',
      ],
    },
  ]

  return (
    <div className="space-y-4">
      {roles.map((r, i) => (
        <Section key={i} title={r.name}>
          <p className="text-sm text-text-muted">{r.desc}</p>
          <ul className="text-sm text-text-muted list-disc list-inside space-y-1 mt-2">
            {r.can.map((c, j) => <li key={j}>{c}</li>)}
          </ul>
        </Section>
      ))}
    </div>
  )
}

function ReportsTab() {
  return (
    <div className="space-y-4">
      <Section title="Персональный отчёт (вкладка Отчёты в заказе)">
        <p className="text-sm text-text-muted">
          Каждый сотрудник вносит свой вклад через вкладку «Отчёты» в карточке заказа.
          Данные привязываются к вашему аккаунту и фиксируются с датой. Вы всегда можете
          посмотреть свои записи в Личном кабинете.
        </p>
        <div className="mt-2 text-sm space-y-1">
          <p><strong>Печатник:</strong> стикеры (шт), фоны (шт), плёнка (м), тип плёнки</p>
          <p><strong>Заливщик:</strong> залито (шт), хороших (шт), смола (г)</p>
          <p><strong>Сборщик:</strong> выбрано (шт), собрано (шт)</p>
          <p><strong>Упаковщик:</strong> упаковано (шт)</p>
        </div>
      </Section>

      <Section title="Отчёты администратора">
        <p className="text-sm text-text-muted mb-2">
          Раздел «Отчёты» (доступен только администратору) содержит 4 таблицы:
        </p>
        <div className="space-y-2 text-sm">
          <div className="bg-surface-dim rounded-lg p-3">
            <p className="font-medium">1. График работы персонала</p>
            <p className="text-text-muted text-xs">Часы работы по дням на основе трекера смен</p>
          </div>
          <div className="bg-surface-dim rounded-lg p-3">
            <p className="font-medium">2. Таблица заказов</p>
            <p className="text-text-muted text-xs">Информация по заказу, фактическая себестоимость материалов, цена продажи, рентабельность</p>
          </div>
          <div className="bg-surface-dim rounded-lg p-3">
            <p className="font-medium">3. Премии по сделке</p>
            <p className="text-text-muted text-xs">Вклад каждого сотрудника за месяц с разбивкой по типу работ</p>
          </div>
          <div className="bg-surface-dim rounded-lg p-3">
            <p className="font-medium">4. Качество печати и заливки</p>
            <p className="text-text-muted text-xs">Тираж, напечатано, залито, забраковано, брак %, излишки</p>
          </div>
        </div>
      </Section>

      <Section title="Экспорт данных">
        <p className="text-sm text-text-muted">
          Все таблицы в разделе «Отчёты» можно экспортировать в CSV для загрузки
          в Google Sheets или Excel.
        </p>
      </Section>
    </div>
  )
}

function FaqTab() {
  const faqs = [
    { q: 'Как взять заказ в работу?', a: 'Нажмите кнопку «Взять» на карточке заказа в очереди. После этого заказ будет назначен на вас.' },
    { q: 'Как внести отчёт по работе?', a: 'Откройте карточку заказа, перейдите на вкладку «Отчёты» и заполните форму. Или нажмите кнопку «Записать» прямо на карточке в очереди.' },
    { q: 'Что если я ошибся в отчёте?', a: 'Обратитесь к администратору — он может скорректировать данные.' },
    { q: 'Как работает трекер смен?', a: 'В Личном кабинете нажмите «Начать смену» когда приходите, «Завершить смену» когда уходите. Система фиксирует часы для расчёта графика.' },
    { q: 'Почему заказ не переходит на следующий этап?', a: 'Заказ переходит автоматически, когда суммарное количество по отчётам достигнет тиража. Проверьте прогресс-бар на карточке заказа.' },
    { q: 'Где посмотреть мою статистику?', a: 'В Личном кабинете — там отображается ваш вклад по заказам, по типам работ и за выбранный период.' },
    { q: 'Как создать заказ?', a: 'Перейдите в Калькулятор, заполните параметры заказа и нажмите «Оформить заказ». Доступно только администратору и менеджеру.' },
    { q: 'Что означают цвета дедлайнов?', a: 'Красный — просрочено. Оранжевый — осталось менее 2 дней. Без цвета — в норме.' },
  ]

  return (
    <div className="space-y-2">
      {faqs.map((faq, i) => (
        <details key={i} className="bg-surface rounded-xl border border-border group">
          <summary className="p-4 cursor-pointer font-medium text-sm flex items-center justify-between">
            {faq.q}
            <span className="text-text-muted group-open:rotate-180 transition-transform">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </span>
          </summary>
          <p className="px-4 pb-4 text-sm text-text-muted">{faq.a}</p>
        </details>
      ))}
    </div>
  )
}

export default function HelpPage() {
  const [tab, setTab] = useState('overview')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display tracking-tight">Справка</h1>
        <p className="text-text-muted">Как работает система Kontora24</p>
      </div>

      <Tabs items={HELP_TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && <OverviewTab />}
      {tab === 'stages' && <StagesTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'faq' && <FaqTab />}
    </div>
  )
}
