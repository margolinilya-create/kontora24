import { useState } from 'react'
import { ProfileCard } from '../components/ProfileCard'
import { UserManagement } from '../components/UserManagement'
import { CreateUser } from '../components/CreateUser'
import { BitrixSettings } from '../components/BitrixSettings'
import { IntegrationLog } from '../components/IntegrationLog'
import { SheetsImport } from '../components/SheetsImport'
import Tabs from '@/shared/components/Tabs'

const SETTINGS_TABS = [
  { key: 'profile', label: 'Профиль' },
  { key: 'users', label: 'Пользователи' },
  { key: 'bitrix', label: 'Bitrix24' },
  { key: 'logs', label: 'Логи' },
  { key: 'import', label: 'Импорт' },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold font-display tracking-tight">Настройки</h1>
        <p className="text-text-muted">Параметры производства и управление пользователями</p>
      </div>

      <Tabs items={SETTINGS_TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'profile' && <ProfileCard />}
      {activeTab === 'users' && (
        <>
          <UserManagement />
          <CreateUser />
        </>
      )}
      {activeTab === 'bitrix' && <BitrixSettings />}
      {activeTab === 'logs' && <IntegrationLog />}
      {activeTab === 'import' && <SheetsImport />}
    </div>
  )
}
