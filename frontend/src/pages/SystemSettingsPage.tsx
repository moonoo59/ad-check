import { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { getSystemSettings, updateSystemSetting, type SystemSetting } from '../lib/apiService';
import PageHeader from '../components/PageHeader';
import { useToast } from '../components/ToastMessage';
import { formatTimestampKst } from '../lib/datetime';

/** setting_key → 한글 표시명 매핑 */
const FEATURE_LABELS: Record<string, string> = {
  'feature.clip_extraction.enabled': '광고 클립 추출 기능',
  'feature.clip_extraction.execution_enabled': '클립 추출 엔진 실행',
};

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const data = await getSystemSettings();
      setSettings(data);
    } catch {
      showToast('설정을 불러오지 못했습니다.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleToggle = async (key: string, currentValue: string) => {
    const newValue = currentValue === 'true' ? 'false' : 'true';
    if (!window.confirm(`이 설정을 ${newValue === 'true' ? '활성화' : '비활성화'}하시겠습니까?`)) {
      return;
    }

    try {
      setIsSaving(true);
      await updateSystemSetting(key, newValue);
      showToast('설정이 수정되었습니다.', 'success');
      await loadSettings();
    } catch {
      showToast('설정 수정에 실패했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="app-page">
        <div className="app-surface px-6 py-5 text-sm text-[var(--app-text-soft)]">
          로딩 중...
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="mb-6">
        <PageHeader
          title="시스템 설정"
          subtitle="시스템 전체 기능 토글(Feature Flag) 및 동작 환경을 설정합니다."
          icon={Settings}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {settings.map((setting) => (
          <div key={setting.id} className="app-surface p-5 flex flex-col h-full">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-[var(--app-text)]">{FEATURE_LABELS[setting.setting_key] ?? setting.setting_key}</h3>
                <code className="text-xs text-[var(--app-text-faint)] bg-[var(--app-bg)] px-1.5 py-0.5 rounded mt-1 inline-block">{setting.setting_key}</code>
                <p className="text-sm text-[var(--app-text-soft)] mt-1">{setting.description}</p>
              </div>
              <div className="shrink-0">
                {setting.value_type === 'boolean' && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleToggle(setting.setting_key, setting.setting_value)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                      setting.setting_value === 'true' ? 'bg-[var(--app-primary)]' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        setting.setting_value === 'true' ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                )}
              </div>
            </div>
            
            <div className="mt-auto pt-4 flex items-center justify-between text-xs text-[var(--app-text-faint)] border-t border-[var(--app-border)]">
              <span>{setting.updated_by_name ? `마지막 수정: ${setting.updated_by_name}` : '시스템 기본값'}</span>
              <span>{formatTimestampKst(setting.updated_at)}</span>
            </div>
          </div>
        ))}

        {settings.length === 0 && (
          <div className="col-span-full app-surface px-6 py-8 text-center text-[var(--app-text-soft)]">
            등록된 시스템 설정이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
