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
import { PlanningSettings } from '@/features/production-planner/components/PlanningSettings'
import { CalculatorSettings } from '@/features/calculator/components/CalculatorSettings'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import Tabs from '@/shared/components/Tabs'

const SETTINGS_TABS = [
  { key: 'profile', label: 'Профиль' },
  { key: 'users', label: 'Пользователи' },
  { key: 'permissions', label: 'Права ролей' },
  { key: 'rates', label: 'Ставки' },
  { key: 'warehouse', label: 'Настройки склада' },
  { key: 'planning', label: 'Производство (бета)' },
  // R25.5 (ТЗ 5.5): видна только с правом calc:settings.
  { key: 'calculator', label: 'Калькулятор', permission: 'calc:settings' },
  { key: 'bitrix', label: 'Bitrix24' },
  { key: 'logs', label: 'Логи' },
  { key: 'import', label: 'Импорт' },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile')
  const canCalcSettings = useCanDo('calc:settings')
  const tabs = SETTINGS_TABS.filter((t) => t.permission !== 'calc:settings' || canCalcSettings)

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
      {activeTab === 'planning' && <PlanningSettings />}
      {activeTab === 'calculator' && canCalcSettings && <CalculatorSettings />}
      {activeTab === 'bitrix' && <BitrixSettings />}
      {activeTab === 'logs' && <IntegrationLog />}
      {activeTab === 'import' && <SheetsImport />}
    </div>
  )
}
