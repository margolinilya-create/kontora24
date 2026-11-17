import { useState } from 'react'
import { ProfileCard } from '../components/ProfileCard'
import { UserManagement } from '../components/UserManagement'
import { CreateUser } from '../components/CreateUser'
import { BitrixSettings } from '../components/BitrixSettings'
import { IntegrationLog } from '../components/IntegrationLog'
import { SheetsImport } from '../components/SheetsImport'
import { RolePermissionsTable } from '../components/RolePermissionsTable'
import { RatesSettings } from '../components/RatesSettings'
import { WarehouseSettings } from '../components/WarehouseSettings'
import { ContractorsSettings } from '../components/ContractorsSettings'
import { PlanningSettings } from '@/features/production-planner/components/PlanningSettings'
import { CalculatorSettings } from '@/features/calculator/components/CalculatorSettings'
import { OrderTypesSettings } from '@/features/order-types/components/OrderTypesSettings'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import Tabs from '@/shared/components/Tabs'

const SETTINGS_TABS = [
  { key: 'profile', label: 'Профиль' },
  { key: 'users', label: 'Пользователи' },
  { key: 'permissions', label: 'Права ролей' },
  { key: 'rates', label: 'Ставки' },
  { key: 'warehouse', label: 'Настройки склада' },
  { key: 'contractors', label: 'Подрядчики' },
  { key: 'planning', label: 'Производство (бета)' },
  // R25.7C (ТЗ 7.1): типы заказов и свои этапы — право order_type:manage.
  { key: 'order_types', label: 'Типы заказов', permission: 'order_type:manage' },
  // R25.5 (ТЗ 5.5): видна только с правом calc:settings.
  { key: 'calculator', label: 'Калькулятор', permission: 'calc:settings' },
  { key: 'bitrix', label: 'Bitrix24' },
  { key: 'logs', label: 'Логи' },
  { key: 'import', label: 'Импорт' },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile')
  const canCalcSettings = useCanDo('calc:settings')
  const canOrderTypes = useCanDo('order_type:manage')
  const allowed = { 'calc:settings': canCalcSettings, 'order_type:manage': canOrderTypes }
  const tabs = SETTINGS_TABS.filter((t) => !t.permission || allowed[t.permission])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold font-display tracking-tight">Настройки</h1>
        <p className="text-text-muted">Параметры производства и управление пользователями</p>
      </div>

      <Tabs items={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'profile' && <ProfileCard />}
      {activeTab === 'users' && (
        <>
          <UserManagement />
          <CreateUser />
        </>
      )}
      {activeTab === 'permissions' && <RolePermissionsTable />}
      {activeTab === 'rates' && <RatesSettings />}
      {activeTab === 'warehouse' && <WarehouseSettings />}
      {activeTab === 'contractors' && <ContractorsSettings />}
      {activeTab === 'planning' && <PlanningSettings />}
      {activeTab === 'calculator' && canCalcSettings && <CalculatorSettings />}
      {activeTab === 'order_types' && canOrderTypes && <OrderTypesSettings />}
      {activeTab === 'bitrix' && <BitrixSettings />}
      {activeTab === 'logs' && <IntegrationLog />}
      {activeTab === 'import' && <SheetsImport />}
    </div>
  )
}
