/**
 * 화면 4: 채널 매핑 관리 페이지 (admin 전용)
 *
 * - 채널 목록 + 인라인 수정 (동시 1행만 수정 가능)
 * - 비활성 채널 포함 표시 토글
 * - 우측 변경 이력 드로어
 * - 새 채널 추가 (인라인 행 삽입)
 * - 삭제 없음 (is_active로만 관리)
 *
 * 주의사항:
 * - storage_folder 변경 시 파일 탐색 경로에 영향 — 경고 표시
 * - is_active 비활성화 시 확인 다이얼로그
 */

import { useState, useEffect, useCallback } from 'react';
import { Tv2 } from 'lucide-react';
import { getChannels, createChannel, updateChannel, getChannelHistories } from '../lib/apiService';
import type { ChannelMapping, ChannelMappingHistory } from '../types';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import SideDrawer from '../components/SideDrawer';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import { useToast } from '../components/ToastMessage';
import { formatTimestampKst } from '../lib/datetime';

const FIELD_LABELS: Record<string, string> = {
  display_name:     '표시명',
  nas_folder:       'NAS 폴더명',
  storage_folder:   '스토리지 폴더명',
  description:      '설명',
  is_active:        '활성 여부',
};

interface EditState {
  storage_folder: string;
  display_name: string;
  nas_folder: string;
  description: string;
  is_active: number;
}

export default function ChannelMappingPage() {
  const { showToast } = useToast();

  const [channels, setChannels] = useState<ChannelMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  // 인라인 수정 상태 (수정 중인 채널 ID, null = 신규 추가)
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 변경 이력 드로어
  const [drawerChannelId, setDrawerChannelId] = useState<number | null>(null);
  const [histories, setHistories] = useState<ChannelMappingHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 비활성화 확인 다이얼로그
  const [deactivateConfirmId, setDeactivateConfirmId] = useState<number | null>(null);

  const loadChannels = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await getChannels(includeInactive);
      // 알파벳 순 정렬
      data.sort((a, b) => a.storage_folder.localeCompare(b.storage_folder));
      setChannels(data);
    } catch {
      setLoadError('채널 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // 수정 시작
  const startEdit = (ch: ChannelMapping) => {
    if (editingId !== null) return; // 이미 수정 중
    setEditingId(ch.id);
    setEditState({
      storage_folder: ch.storage_folder,
      display_name:   ch.display_name,
      nas_folder:     ch.nas_folder,
      description:    ch.description ?? '',
      is_active:      ch.is_active,
    });
  };

  // 신규 추가 시작
  const startNew = () => {
    if (editingId !== null) return;
    setEditingId('new');
    setEditState({ storage_folder: '', display_name: '', nas_folder: '', description: '', is_active: 1 });
  };

  // 수정 취소
  const cancelEdit = () => {
    setEditingId(null);
    setEditState(null);
  };

  // 저장 처리
  const handleSave = async () => {
    if (!editState) return;
    if (!editState.storage_folder.trim()) { showToast('스토리지 폴더명을 입력하세요.', 'error'); return; }
    if (!editState.display_name.trim()) { showToast('표시명을 입력하세요.', 'error'); return; }
    if (!editState.nas_folder.trim()) { showToast('NAS 폴더명을 입력하세요.', 'error'); return; }

    setIsSaving(true);
    try {
      if (editingId === 'new') {
        await createChannel({
          storage_folder: editState.storage_folder,
          display_name:   editState.display_name,
          nas_folder:     editState.nas_folder,
          description:    editState.description || undefined,
        });
        showToast('채널이 추가되었습니다.', 'success');
      } else {
        // 기존 채널 업데이트
        const original = channels.find((c) => c.id === editingId);
        if (original && original.is_active === 1 && editState.is_active === 0) {
          // 비활성화 시도 → 확인 다이얼로그
          setDeactivateConfirmId(editingId as number);
          setIsSaving(false);
          return;
        }
        await updateChannel(editingId as number, {
          storage_folder: editState.storage_folder,
          display_name:   editState.display_name,
          nas_folder:     editState.nas_folder,
          description:    editState.description || undefined,
          is_active:      editState.is_active,
        });
        showToast('채널이 수정되었습니다.', 'success');
      }
      cancelEdit();
      await loadChannels();
    } catch (err: unknown) {
      // 409 Conflict: 중복 storage_folder
      if ((err as { response?: { status: number } })?.response?.status === 409) {
        showToast('이미 사용 중인 스토리지 폴더명입니다.', 'error');
      } else {
        showToast('저장에 실패했습니다.', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // 비활성화 확인 후 실행
  const handleDeactivateConfirm = async () => {
    if (deactivateConfirmId === null || !editState) return;
    setDeactivateConfirmId(null);
    setIsSaving(true);
    try {
      await updateChannel(deactivateConfirmId, {
        storage_folder: editState.storage_folder,
        display_name:   editState.display_name,
        nas_folder:     editState.nas_folder,
        description:    editState.description || undefined,
        is_active:      0,
      });
      showToast('채널이 비활성화되었습니다.', 'success');
      cancelEdit();
      await loadChannels();
    } catch {
      showToast('저장에 실패했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // 변경 이력 드로어 열기
  const openHistory = async (id: number) => {
    setDrawerChannelId(id);
    setHistoryLoading(true);
    try {
      const data = await getChannelHistories(id);
      setHistories(data);
    } catch {
      showToast('이력을 불러오지 못했습니다.', 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  const drawerChannel = channels.find((c) => c.id === drawerChannelId);

  const inputClass = 'app-field app-field--dense';

  const activeCount  = channels.filter((c) => c.is_active === 1).length;
  const inactiveCount = channels.filter((c) => c.is_active === 0).length;

  return (
    <div className="app-page">
      <PageHeader
        title="채널 매핑 관리"
        subtitle="Logger Storage 채널명과 공유 NAS 폴더명을 연결하는 기준 테이블입니다."
        icon={Tv2}
      >
        <button
          type="button"
          onClick={startNew}
          disabled={editingId !== null}
          className="app-btn app-btn--primary"
        >
          새 채널 추가
        </button>
      </PageHeader>

      {/* 비활성 포함 토글 */}
      <div className="app-toolbar-card mb-4 flex items-center justify-between gap-3 p-4">
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-[var(--app-text-soft)]">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="cursor-pointer"
          />
          비활성 채널 포함 표시
        </label>
        <span className="app-inline-note">편집은 한 번에 한 행만 가능합니다.</span>
      </div>

      {loadError && <ErrorBanner message={loadError} onRetry={loadChannels} />}

      {/* 채널 매핑 테이블 */}
      <div className="app-table-shell mb-3">
        <table className="app-table text-sm">
          <thead>
            <tr>
              <th className="min-w-[140px]">스토리지 폴더명</th>
              <th className="min-w-[110px]">표시명</th>
              <th className="min-w-[120px]">NAS 폴더</th>
              <th className="min-w-[180px]">설명</th>
              <th className="min-w-[90px]">상태</th>
              <th className="min-w-[180px]">작업</th>
            </tr>
          </thead>
          <tbody>
            {/* 신규 추가 행 */}
            {editingId === 'new' && editState && (
              <tr className="bg-[rgba(120,88,68,0.05)]">
                <td>
                  <input
                    type="text"
                    value={editState.storage_folder}
                    onChange={(e) => setEditState((s) => s ? { ...s, storage_folder: e.target.value } : s)}
                    className={inputClass}
                    placeholder="예: ETV"
                    autoFocus
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={editState.display_name}
                    onChange={(e) => setEditState((s) => s ? { ...s, display_name: e.target.value } : s)}
                    className={inputClass}
                    placeholder="예: 라이프"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={editState.nas_folder}
                    onChange={(e) => setEditState((s) => s ? { ...s, nas_folder: e.target.value } : s)}
                    className={inputClass}
                    placeholder="예: 라이프"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={editState.description}
                    onChange={(e) => setEditState((s) => s ? { ...s, description: e.target.value } : s)}
                    className={inputClass}
                    placeholder="설명 (선택)"
                  />
                </td>
                <td>
                  <span className="text-xs text-[var(--app-text-faint)]">활성</span>
                </td>
                <td>
                  <div className="flex gap-1 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="app-btn app-btn--primary app-btn--sm"
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="app-btn app-btn--secondary app-btn--sm"
                  >
                    취소
                  </button>
                  </div>
                </td>
              </tr>
            )}

            {/* 채널 목록 행 */}
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--app-text-soft)]">로딩 중...</td>
              </tr>
            ) : channels.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState message="등록된 채널 매핑이 없습니다." actionLabel="+ 새 채널 추가" onAction={startNew} />
                </td>
              </tr>
            ) : (
              channels.map((ch) => {
                const isEditing = editingId === ch.id && editState;
                return (
                  <tr
                    key={ch.id}
                    className={`${ch.is_active === 0 ? 'opacity-50' : ''}`}
                  >
                    {/* 스토리지 폴더명 */}
                    <td>
                      {isEditing ? (
                        <>
                          <input
                            type="text"
                            value={editState.storage_folder}
                            onChange={(e) => setEditState((s) => s ? { ...s, storage_folder: e.target.value } : s)}
                            className={inputClass}
                          />
                          {editState.storage_folder !== ch.storage_folder && (
                            <p className="mt-1 text-xs text-amber-700">경로 변경 시 기존 탐색에 영향을 줄 수 있습니다.</p>
                          )}
                        </>
                      ) : (
                        <span className="font-mono text-xs text-[var(--app-text)]">{ch.storage_folder}</span>
                      )}
                    </td>
                    {/* 표시명 */}
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editState.display_name}
                          onChange={(e) => setEditState((s) => s ? { ...s, display_name: e.target.value } : s)}
                          className={inputClass}
                        />
                      ) : (
                        <span className={ch.is_active === 0 ? 'text-[var(--app-text-faint)]' : 'text-[var(--app-text)]'}>{ch.display_name}</span>
                      )}
                    </td>
                    {/* NAS 폴더 */}
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editState.nas_folder}
                          onChange={(e) => setEditState((s) => s ? { ...s, nas_folder: e.target.value } : s)}
                          className={inputClass}
                        />
                      ) : (
                        <span className="text-[var(--app-text-soft)]">{ch.nas_folder}</span>
                      )}
                    </td>
                    {/* 설명 */}
                    <td className="text-xs text-[var(--app-text-soft)]">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editState.description}
                          onChange={(e) => setEditState((s) => s ? { ...s, description: e.target.value } : s)}
                          className={inputClass}
                        />
                      ) : (
                        ch.description ?? ''
                      )}
                    </td>
                    {/* 상태 */}
                    <td>
                      {isEditing ? (
                        <select
                          value={editState.is_active}
                          onChange={(e) => setEditState((s) => s ? { ...s, is_active: Number(e.target.value) } : s)}
                          className="app-select app-select--dense bg-[rgba(255,252,248,0.95)]"
                        >
                          <option value={1}>활성</option>
                          <option value={0}>비활성</option>
                        </select>
                      ) : (
                        <StatusBadge status={ch.is_active === 1 ? 'active' : 'inactive'} />
                      )}
                    </td>
                    {/* 작업 버튼 */}
                    <td>
                      {isEditing ? (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaving}
                            className="app-btn app-btn--primary app-btn--sm"
                          >
                            저장
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="app-btn app-btn--secondary app-btn--sm"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(ch)}
                            disabled={editingId !== null}
                            className="app-btn app-btn--secondary app-btn--sm"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => openHistory(ch.id)}
                            disabled={editingId !== null}
                            className="app-btn app-btn--ghost app-btn--sm"
                          >
                            이력
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 결과 요약 */}
      {!isLoading && (
        <p className="text-sm text-[var(--app-text-soft)]">
          {channels.length}개 채널 (활성: {activeCount}, 비활성: {inactiveCount})
        </p>
      )}

      {/* 비활성화 확인 다이얼로그 */}
      <ConfirmDialog
        open={deactivateConfirmId !== null}
        title="채널 비활성화"
        message="이 채널을 비활성화하면 신규 요청에서 선택할 수 없게 됩니다. 계속하시겠습니까?"
        confirmLabel="비활성화"
        confirmVariant="red"
        onConfirm={handleDeactivateConfirm}
        onCancel={() => setDeactivateConfirmId(null)}
      />

      {/* 변경 이력 드로어 */}
      <SideDrawer
        open={drawerChannelId !== null}
        title={`${drawerChannel?.storage_folder ?? ''} 채널 변경 이력`}
        onClose={() => setDrawerChannelId(null)}
      >
        {historyLoading ? (
          <p className="text-sm text-[var(--app-text-soft)]">로딩 중...</p>
        ) : histories.length === 0 ? (
          <p className="text-sm text-[var(--app-text-soft)]">변경 이력이 없습니다. (초기 등록 이후 변경 없음)</p>
        ) : (
          <div className="space-y-3">
            {histories.map((h) => (
              <div key={h.id} className="border-b border-[rgba(212,197,183,0.7)] pb-3">
                <div className="mb-1 text-xs text-[var(--app-text-faint)]">
                  {formatTimestampKst(h.changed_at, { seconds: true })}
                  {h.changed_by_name && <span className="ml-2 font-medium text-[var(--app-text)]">{h.changed_by_name}</span>}
                </div>
                <div className="text-xs text-[var(--app-text)]">
                  <span className="font-medium">{FIELD_LABELS[h.field_name] ?? h.field_name}: </span>
                  <span className="text-rose-500">{h.old_value ?? '(없음)'}</span>
                  <span className="mx-1 text-[var(--app-text-faint)]">→</span>
                  <span className="text-emerald-700">{h.new_value ?? '(없음)'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SideDrawer>
    </div>
  );
}
