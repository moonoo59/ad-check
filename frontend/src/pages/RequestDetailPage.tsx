/**
 * 화면 3: 파일 탐색 결과 확인 + 승인/반려/수정 페이지
 *
 * 4개 영역 구성:
 * A - 요청 헤더 정보 (읽기 전용)
 * B - 요청 항목 테이블
 * C - 선택된 항목의 파일 탐색 결과 / 오전송 수정 폼
 * D - 요청 단위 액션 바
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileSearch } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  approveRequest,
  deleteCopiedFile,
  deleteRequest,
  downloadRequestItemFile,
  getChannels,
  getRequestDetail,
  rejectRequest,
  resendRequest,
  retryCopy,
  retryFileSearch,
  selectFile,
  updateRequestItem,
} from '../lib/apiService';
import { normalizeDateInput } from '../lib/dateUtils';
import { normalizeTimeInput, TIME_RANGE_OPTIONS } from '../lib/requestTime';
import type {
  ChannelMapping,
  CopyJob,
  FileSearchResult,
  RequestDetail,
  RequestItem,
} from '../types';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import InfoCard, { type InfoItem } from '../components/InfoCard';
import FileSizeDisplay from '../components/FileSizeDisplay';
import ErrorBanner from '../components/ErrorBanner';
import { useToast } from '../components/ToastMessage';
import { formatTimestampKst } from '../lib/datetime';
import CopyProgressRow from '../components/request-detail/CopyProgressRow';
import RequestItemsTable from '../components/request-detail/RequestItemsTable';
import RequestActionDialogs from '../components/request-detail/RequestActionDialogs';

type ItemWithResults = RequestItem & {
  file_search_results: FileSearchResult[];
  copy_job: CopyJob | null;
};

interface CorrectionFormState {
  channel_mapping_id: string;
  broadcast_date: string;
  req_time_start: string;
  req_time_end: string;
  monitoring_time: string;
}

function getSelectedFile(item: ItemWithResults): FileSearchResult | null {
  return item.file_search_results.find((file) => file.is_selected === 1) ?? null;
}

function getExactMatchFiles(item: ItemWithResults): FileSearchResult[] {
  return item.file_search_results.filter((file) => file.match_score === 100);
}

function getSelectedExactMatchFile(item: ItemWithResults): FileSearchResult | null {
  return item.file_search_results.find((file) => file.is_selected === 1 && file.match_score === 100) ?? null;
}

function getCorrectionFormValue(item: ItemWithResults): CorrectionFormState {
  return {
    channel_mapping_id: String(item.channel_mapping_id),
    broadcast_date: item.broadcast_date,
    req_time_start: item.req_time_start,
    req_time_end: item.req_time_end,
    monitoring_time: item.monitoring_time,
  };
}

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [channels, setChannels] = useState<ChannelMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedItemIdx, setSelectedItemIdx] = useState(0);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [retryConfirmOpen, setRetryConfirmOpen] = useState(false);
  const [retryCopyConfirmOpen, setRetryCopyConfirmOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [resendModalOpen, setResendModalOpen] = useState(false);
  const [resendReason, setResendReason] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteCopiedFileConfirmOpen, setDeleteCopiedFileConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<CorrectionFormState>({
    channel_mapping_id: '',
    broadcast_date: '',
    req_time_start: '',
    req_time_end: '',
    monitoring_time: '',
  });

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getRequestDetail(Number(id));
      setDetail(data);
      setLoadError('');
    } catch {
      setLoadError('요청 상세를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!user?.can_copy) {
      return;
    }

    getChannels(false).then(setChannels).catch(() => {
      showToast('채널 목록을 불러오지 못했습니다.', 'error');
    });
  }, [showToast, user?.can_copy]);

  useEffect(() => {
    if (!detail) {
      return;
    }

    const hasSearchingItem = detail.items.some((item) => item.item_status === 'searching');
    const isPolling = detail.status === 'copying' || detail.status === 'searching' || hasSearchingItem;

    if (isPolling) {
      const interval = detail.status === 'copying' ? 10000 : 5000;
      pollingRef.current = setInterval(loadDetail, interval);
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [detail, loadDetail]);

  useEffect(() => {
    if (!detail?.items.length) {
      return;
    }

    if (selectedItemIdx > detail.items.length - 1) {
      setSelectedItemIdx(0);
    }
  }, [detail?.items.length, selectedItemIdx]);

  if (isLoading) {
    return (
      <div className="app-page">
        <div className="app-surface px-6 py-5 text-sm text-[var(--app-text-soft)]">로딩 중...</div>
      </div>
    );
  }

  if (loadError || !detail) {
    return (
      <div className="app-page">
        <ErrorBanner message={loadError || '요청을 찾을 수 없습니다.'} onRetry={loadDetail} />
      </div>
    );
  }

  const items: ItemWithResults[] = detail.items ?? [];
  const selectedItem = items[selectedItemIdx] ?? items[0];
  const canAct = !!user?.can_copy;
  const isRejected = detail.status === 'rejected';
  const isCopyFailed = detail.status === 'failed' && items.some((item) => item.copy_job !== null);
  const isSearchFailed = detail.status === 'failed' && !isCopyFailed;
  const isApprovedPendingCopy = detail.status === 'approved';
  const editingTargets = items.filter((item) => item.item_status !== 'done');
  const hasEditingSearchInProgress = editingTargets.some((item) => item.item_status === 'searching');
  const allItemsHaveSelectedFile = items.every((item) =>
    item.file_search_results.some((file) => file.is_selected === 1 && file.match_score === 100),
  );
  const hasUnselectedFileCandidate = items.some((item) =>
    getExactMatchFiles(item).length > 0 && !item.file_search_results.some((file) => file.is_selected === 1 && file.match_score === 100),
  );
  const editingItemsReadyForCopy =
    detail.status === 'editing' &&
    editingTargets.length > 0 &&
    editingTargets.every((item) =>
      item.item_status !== 'searching' &&
      item.file_search_results.some((file) => file.is_selected === 1 && file.match_score === 100),
    );
  const selectedItemHasActiveCopy =
    selectedItem?.copy_job?.status === 'done' && !selectedItem.copy_job?.deleted_at;
  const selectedItemCorrectionBusy = items.some((item) =>
    item.id !== selectedItem?.id && (item.item_status === 'searching' || item.item_status === 'copying'),
  );
  const canStartCorrection =
    canAct &&
    !!selectedItem &&
    (detail.status === 'done' || detail.status === 'editing') &&
    selectedItem.item_status !== 'copying' &&
    !selectedItemCorrectionBusy &&
    (editingItemId === null || editingItemId === selectedItem.id);
  const summaryItems: InfoItem[] = [
    { label: '요청자', value: detail.requester_name ?? '-' },
    { label: '요청일시', value: formatTimestampKst(detail.created_at) },
    { label: '상태', value: <StatusBadge status={detail.status} /> },
    { label: '검토자', value: detail.reviewed_by_name ?? '-' },
    ...(detail.reviewed_at
      ? [{ label: '검토일시', value: formatTimestampKst(detail.reviewed_at) }]
      : []),
    ...(detail.request_memo
      ? [{ label: '요청 메모', value: detail.request_memo, span: true }]
      : []),
    ...(isRejected && detail.reject_reason
      ? [{ label: '반려 사유', value: <span className="text-red-600">{detail.reject_reason}</span>, span: true }]
      : []),
  ];

  const handleSelectFile = async (itemId: number, fileId: number) => {
    try {
      await selectFile(itemId, { file_search_result_id: fileId });
      await loadDetail();
    } catch {
      showToast('파일 선택에 실패했습니다.', 'error');
    }
  };

  const handleSelectAll = async () => {
    setIsProcessing(true);
    try {
      let selectedCount = 0;
      for (const item of items) {
        const alreadySelected = item.file_search_results.some((file) => file.is_selected === 1 && file.match_score === 100);
        if (alreadySelected) continue;

        const topMatchedFile = getExactMatchFiles(item)[0];
        if (topMatchedFile) {
          await selectFile(item.id, { file_search_result_id: topMatchedFile.id });
          selectedCount += 1;
        }
      }

      if (selectedCount > 0) {
        await loadDetail();
        showToast(`${selectedCount}개 항목에 상위 점수 파일이 자동 선택되었습니다.`, 'success');
      } else {
        showToast('자동 선택할 파일이 없습니다.', 'warning');
      }
    } catch {
      showToast('파일 자동 선택에 실패했습니다.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveConfirm = async () => {
    setApproveConfirmOpen(false);
    setIsProcessing(true);
    try {
      await approveRequest(detail.id);
      showToast('승인 완료. 파일 복사가 시작됩니다.', 'success');
      await loadDetail();
    } catch {
      showToast('승인 처리에 실패했습니다.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (rejectReason.trim().length < 5) {
      showToast('반려 사유를 5자 이상 입력해주세요.', 'warning');
      return;
    }

    setRejectModalOpen(false);
    setIsProcessing(true);
    try {
      await rejectRequest(detail.id, { reject_reason: rejectReason.trim() });
      showToast('반려 처리되었습니다.', 'success');
      await loadDetail();
    } catch {
      showToast('반려 처리에 실패했습니다.', 'error');
    } finally {
      setIsProcessing(false);
      setRejectReason('');
    }
  };

  const handleRetryConfirm = async () => {
    setRetryConfirmOpen(false);
    setIsProcessing(true);
    try {
      await retryFileSearch(detail.id);
      await loadDetail();
      showToast('파일 탐색이 시작되었습니다. 5초마다 자동으로 갱신됩니다.', 'success');
    } catch {
      showToast('탐색 재시도에 실패했습니다. 스토리지가 마운트되어 있는지 확인해주세요.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetryCopyConfirm = async () => {
    setRetryCopyConfirmOpen(false);
    setIsProcessing(true);
    try {
      await retryCopy(detail.id);
      showToast(detail.status === 'editing' ? '수정 항목 복사를 실행합니다.' : '복사를 재시도합니다.', 'success');
      await loadDetail();
    } catch {
      showToast('복사 실행에 실패했습니다.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResendConfirm = async () => {
    if (resendReason.trim().length < 5) {
      showToast('재전송 사유를 5자 이상 입력해주세요.', 'warning');
      return;
    }

    setResendModalOpen(false);
    setIsProcessing(true);
    try {
      await resendRequest(detail.id, resendReason.trim());
      showToast('재전송 요청이 등록되었습니다. 관리자/기술팀이 복사를 실행해야 합니다.', 'success');
      setResendReason('');
      await loadDetail();
    } catch {
      showToast('재전송에 실패했습니다.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteConfirm = async () => {
    setDeleteConfirmOpen(false);
    setIsProcessing(true);
    try {
      await deleteRequest(detail.id);
      showToast('요청이 삭제되었습니다.', 'success');
      navigate('/requests');
    } catch {
      showToast('삭제에 실패했습니다.', 'error');
      setIsProcessing(false);
    }
  };

  const handleDownload = async (itemId: number) => {
    if (!detail) return;
    setIsProcessing(true);
    try {
      await downloadRequestItemFile(detail.id, itemId);
    } catch (err: unknown) {
      // 410 Gone: 보관 기간 만료
      const status = (err as { response?: { status?: number; data?: { message?: string } } })?.response?.status;
      if (status === 410) {
        showToast('보관 기간이 만료되어 파일이 삭제되었습니다. 필요한 경우 재요청해주세요.', 'error');
        await loadDetail(); // 만료 상태 반영
      } else {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        showToast(msg ?? '파일 다운로드에 실패했습니다.', 'error');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteCopiedFile = async () => {
    if (!selectedItem?.copy_job?.id || !selectedItemHasActiveCopy) {
      return;
    }
    setDeleteCopiedFileConfirmOpen(true);
  };

  const handleDeleteCopiedFileConfirm = async () => {
    if (!selectedItem?.copy_job?.id || !selectedItemHasActiveCopy) {
      setDeleteCopiedFileConfirmOpen(false);
      return;
    }

    setDeleteCopiedFileConfirmOpen(false);
    setIsProcessing(true);
    try {
      await deleteCopiedFile(selectedItem.copy_job.id);
      showToast('공유 NAS 복사본을 삭제했습니다.', 'success');
      await loadDetail();
    } catch {
      showToast('파일 삭제에 실패했습니다.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const startCorrection = () => {
    if (!selectedItem) {
      return;
    }

    if (editingItemId !== null && editingItemId !== selectedItem.id) {
      showToast('한 번에 한 항목만 수정할 수 있습니다.', 'warning');
      return;
    }

    setEditingItemId(selectedItem.id);
    setEditForm(getCorrectionFormValue(selectedItem));
  };

  const cancelCorrection = () => {
    setEditingItemId(null);
    if (selectedItem) {
      setEditForm(getCorrectionFormValue(selectedItem));
    }
  };

  const handleCorrectionSave = async () => {
    if (!selectedItem) return;

    const normalizedDate = normalizeDateInput(editForm.broadcast_date);
    const normalizedMonitoringTime = normalizeTimeInput(editForm.monitoring_time);

    if (!editForm.channel_mapping_id) {
      showToast('채널을 선택해주세요.', 'warning');
      return;
    }
    if (!normalizedDate) {
      showToast('방송일자는 YYYY-MM-DD 형식으로 입력해주세요.', 'warning');
      return;
    }
    if (!editForm.req_time_start || !editForm.req_time_end) {
      showToast('시간대를 선택해주세요.', 'warning');
      return;
    }
    if (!normalizedMonitoringTime) {
      showToast('송출 시간은 HH:MM 또는 HH:MM:SS 형식으로 입력해주세요.', 'warning');
      return;
    }

    setIsProcessing(true);
    try {
      await updateRequestItem(detail.id, selectedItem.id, {
        channel_mapping_id: Number(editForm.channel_mapping_id),
        broadcast_date: normalizedDate,
        req_time_start: editForm.req_time_start,
        req_time_end: editForm.req_time_end,
        monitoring_time: normalizedMonitoringTime,
      });
      setEditingItemId(null);
      showToast('항목 수정 후 재탐색을 시작했습니다.', 'success');
      await loadDetail();
    } catch {
      showToast('항목 수정에 실패했습니다.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="app-page">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => navigate('/requests')}
            className="app-btn app-btn--ghost app-btn--sm mb-3"
          >
            목록으로
          </button>
          <PageHeader
            title={`요청 #${detail.id} 상세`}
            subtitle="요청 정보와 파일 탐색 결과를 읽기 쉽게 정리해 보여줍니다."
            icon={FileSearch}
          />
        </div>
        {user?.role === 'admin' && (
          <button
            type="button"
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={isProcessing || detail.status === 'copying' || detail.status === 'searching'}
            className="app-btn app-btn--danger ml-auto"
          >
            요청 삭제
          </button>
        )}
      </div>

      <InfoCard
        compact
        className="mb-4"
        items={summaryItems}
      />

      {detail.status === 'done' && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-emerald-200 bg-[rgba(242,249,244,0.96)] px-4 py-3 text-sm text-emerald-800">
          <span>✓ 이 요청은 처리 완료되었습니다.</span>
          <button
            type="button"
            onClick={() => setResendModalOpen(true)}
            disabled={isProcessing}
            className="app-btn app-btn--primary app-btn--sm"
          >
            재전송 요청
          </button>
        </div>
      )}

      {detail.status === 'editing' && (
        <div className="mb-3 rounded-[22px] border border-amber-200 bg-[rgba(255,248,236,0.96)] px-4 py-3 text-sm text-amber-900">
          <div className="font-medium">요청 수정중</div>
          <div className="mt-1 text-xs text-amber-800">
            수정 대상 항목만 다시 탐색하고 복사할 수 있습니다.
            {hasEditingSearchInProgress ? ' 탐색 중인 항목이 있어 5초마다 자동 갱신됩니다.' : ''}
          </div>
        </div>
      )}

      {isApprovedPendingCopy && canAct && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-amber-200 bg-[rgba(255,248,236,0.96)] px-4 py-3 text-sm text-amber-900">
          <span>재전송 요청이 등록되어 있습니다. 파일 선택을 확인 후 복사를 실행하세요.</span>
          <button
            type="button"
            onClick={() => setRetryCopyConfirmOpen(true)}
            disabled={isProcessing}
            className="app-btn app-btn--primary app-btn--sm"
          >
            복사 실행
          </button>
        </div>
      )}

      {detail.status === 'searching' && (
        <div className="mb-3 flex items-center gap-2 rounded-[22px] border border-amber-200 bg-[rgba(255,248,236,0.96)] px-4 py-3 text-sm text-amber-900">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          파일 탐색이 진행 중입니다. 5초마다 자동 갱신됩니다.
        </div>
      )}

      {detail.status === 'copying' && (
        <div className="mb-3">
          <div className="mb-2 flex items-center gap-2 rounded-[22px] border border-sky-200 bg-[rgba(241,247,255,0.96)] px-4 py-3 text-sm text-sky-900">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-500" />
            파일 복사가 진행 중입니다. 10초마다 자동 갱신됩니다.
          </div>
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <CopyProgressRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <RequestItemsTable
          items={items}
          selectedItemIdx={selectedItemIdx}
          onSelectItem={setSelectedItemIdx}
        />

        {selectedItem && (
          <section className="app-surface p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-[var(--app-text)]">파일 탐색 결과</h2>
                <p className="mt-1 text-sm text-[var(--app-text-faint)]">
                  {selectedItem.channel_display_name} / {selectedItem.advertiser} / {selectedItem.broadcast_date}
                </p>
              </div>

              {canAct && (
                <div className="flex flex-wrap gap-2">
                  {canStartCorrection && (
                    editingItemId === selectedItem.id ? (
                      <button
                        type="button"
                        onClick={cancelCorrection}
                        disabled={isProcessing}
                        className="app-btn app-btn--secondary app-btn--sm"
                      >
                        수정 취소
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={startCorrection}
                        disabled={isProcessing}
                        className="app-btn app-btn--soft app-btn--sm"
                      >
                        오전송 수정
                      </button>
                    )
                  )}
                  {selectedItemHasActiveCopy && (
                    <button
                      type="button"
                      onClick={handleDeleteCopiedFile}
                      disabled={isProcessing}
                      className="app-btn app-btn--danger app-btn--sm"
                    >
                      파일 삭제
                    </button>
                  )}
                </div>
              )}
            </div>

            {selectedItem.item_status === 'done' && !selectedItem.copy_job?.deleted_at && (
              <div className="mb-2.5 flex items-center justify-between rounded-[20px] border border-emerald-200 bg-[rgba(242,249,244,0.96)] px-3 py-2">
                <span className="text-xs text-emerald-800">✓ 이 항목은 복사가 완료되었습니다.</span>
                <button
                  onClick={() => handleDownload(selectedItem.id)}
                  disabled={isProcessing}
                  className="app-btn app-btn--primary app-btn--sm"
                >
                  다운로드
                </button>
              </div>
            )}

            {selectedItem.item_status === 'done' && selectedItem.copy_job?.deleted_at && (
              <div className="mb-2.5 rounded-[20px] border border-[var(--app-border)] bg-[rgba(245,237,229,0.84)] px-3 py-2 text-xs text-[var(--app-text-soft)]">
                보관 기간이 만료되어 파일이 삭제되었습니다. 필요 시 재전송 흐름으로 다시 복사할 수 있습니다.
              </div>
            )}

            {editingItemId === selectedItem.id && (
              <div className="mb-3 rounded-[20px] border border-[var(--app-border)] bg-[rgba(255,252,248,0.82)] p-4">
                <h3 className="mb-3 text-sm font-semibold text-[var(--app-text)]">오전송 수정</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="app-label">채널</label>
                    <select
                      value={editForm.channel_mapping_id}
                      onChange={(event) => setEditForm((prev) => ({
                        ...prev,
                        channel_mapping_id: event.target.value,
                      }))}
                      className="app-select"
                    >
                      <option value="">채널 선택</option>
                      {channels.map((channel) => (
                        <option key={channel.id} value={channel.id}>
                          {channel.display_name} ({channel.storage_folder})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="app-label">방송일자</label>
                    <input
                      type="date"
                      value={editForm.broadcast_date}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, broadcast_date: event.target.value }))}
                      className="app-field"
                    />
                  </div>

                  <div>
                    <label className="app-label">시간대</label>
                    <select
                      value={editForm.req_time_start}
                      onChange={(event) => {
                        const option = TIME_RANGE_OPTIONS.find((entry) => entry.start === event.target.value);
                        setEditForm((prev) => ({
                          ...prev,
                          req_time_start: option?.start ?? '',
                          req_time_end: option?.end ?? '',
                        }));
                      }}
                      className="app-select"
                    >
                      <option value="">시간대 선택</option>
                      {TIME_RANGE_OPTIONS.map((option) => (
                        <option key={option.start} value={option.start}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="app-label">송출 시간</label>
                    <input
                      type="text"
                      value={editForm.monitoring_time}
                      inputMode="numeric"
                      maxLength={8}
                      onChange={(event) => setEditForm((prev) => ({
                        ...prev,
                        monitoring_time: event.target.value,
                      }))}
                      className="app-field"
                      placeholder="HH:MM:SS"
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-[var(--app-text-soft)]">
                    저장하면 기존 복사본과 탐색 결과를 정리한 뒤 해당 항목만 다시 탐색합니다.
                  </p>
                  <button
                    type="button"
                    onClick={handleCorrectionSave}
                    disabled={isProcessing}
                    className="app-btn app-btn--primary app-btn--sm"
                  >
                    수정 저장
                  </button>
                </div>
              </div>
            )}

            {(() => {
              const fileResults = getExactMatchFiles(selectedItem);
              const hasTotalResults = fileResults.length > 0;
              const selectedFile = getSelectedExactMatchFile(selectedItem) ?? getSelectedFile(selectedItem);

              if (!hasTotalResults) {
                return (
                  <div className="rounded-[20px] border border-dashed border-[var(--app-border)] bg-[rgba(255,252,248,0.72)] px-4 py-8 text-center text-sm text-[var(--app-text-soft)]">
                    <p className="mb-1">이 항목에 대해 정확도 100점 파일이 없습니다.</p>
                    <p className="text-xs text-[var(--app-text-faint)]">탐색이 완료되지 않았거나, 현재 탐색 결과 중 정확히 일치하는 파일이 없을 수 있습니다.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-2.5">
                  {selectedFile && selectedFile.match_score !== 100 && (
                    <div className="rounded-[20px] border border-amber-200 bg-[rgba(255,248,236,0.96)] px-3 py-2 text-xs text-amber-900">
                      기존에 100점 미만 파일이 선택되어 있었습니다. 현재 화면에서는 100점 파일만 표시합니다.
                    </div>
                  )}

                  <div className="app-table-shell app-table-shell--flat">
                    <table className="app-table app-table--compact app-table--fixed app-table--wrap text-sm">
                      <thead>
                        <tr>
                          <th className="w-[48px]" />
                          <th className="w-[84px]">점수</th>
                          <th className="w-[32%]">파일명</th>
                          <th className="w-[112px]">크기</th>
                          <th className="w-[88px]">시작</th>
                          <th className="w-[88px]">종료</th>
                          <th className="w-[34%]">근거</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fileResults.map((file) => {
                          const isDoneItem = selectedItem.item_status === 'done' && detail.status !== 'editing';
                          return (
                            <tr
                              key={file.id}
                              className={file.is_selected === 1 ? 'bg-[rgba(120,88,68,0.05)]' : ''}
                            >
                              <td className="text-center">
                                <input
                                  type="radio"
                                  name={`file-select-${selectedItem.id}`}
                                  checked={file.is_selected === 1}
                                  onChange={() => handleSelectFile(selectedItem.id, file.id)}
                                  disabled={!canAct || isDoneItem || isProcessing}
                                  className="cursor-pointer disabled:cursor-not-allowed"
                                />
                              </td>
                              <td className="align-top">
                                <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
                                  file.match_score === 100
                                    ? 'border-emerald-200 bg-[rgba(242,249,244,0.96)] text-emerald-700'
                                    : 'border-amber-200 bg-[rgba(255,248,236,0.96)] text-amber-800'
                                }`}>
                                  {file.match_score}점
                                </span>
                              </td>
                              <td className="align-top font-mono text-[var(--app-text)]">{file.file_name}</td>
                              <td className="align-top">
                                <FileSizeDisplay bytes={file.file_size_bytes} />
                              </td>
                              <td className="align-top whitespace-nowrap tabular-nums text-[var(--app-text-soft)]">{file.file_start_time}</td>
                              <td className="align-top whitespace-nowrap tabular-nums text-[var(--app-text-soft)]">{file.file_end_time}</td>
                              <td className="align-top leading-6 text-[var(--app-text-soft)]" title={file.match_reason}>
                                {file.match_reason}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </section>
        )}
      </div>

      {canAct && detail.status !== 'done' && detail.status !== 'copying' && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {isProcessing && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--app-text-soft)]">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[rgba(120,88,68,0.18)] border-t-[var(--app-primary)]" />
                처리 중...
              </span>
            )}

            {(isSearchFailed || detail.status === 'search_done') && (
              <button
                type="button"
                onClick={() => setRetryConfirmOpen(true)}
                disabled={isProcessing}
                className="app-btn app-btn--secondary"
              >
                탐색 재시도
              </button>
            )}

            {detail.status === 'search_done' && hasUnselectedFileCandidate && (
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={isProcessing}
                className="app-btn app-btn--soft"
              >
                전체 선택
              </button>
            )}

            {isCopyFailed && (
              <button
                type="button"
                onClick={() => setRetryCopyConfirmOpen(true)}
                disabled={isProcessing}
                className="app-btn app-btn--soft"
              >
                복사 재시도
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {detail.status === 'editing' && (
              <button
                type="button"
                onClick={() => setRetryCopyConfirmOpen(true)}
                disabled={isProcessing || !editingItemsReadyForCopy || hasEditingSearchInProgress}
                className="app-btn app-btn--primary"
                title={!editingItemsReadyForCopy ? '수정 중인 항목에 선택된 파일이 필요합니다.' : ''}
              >
                수정 항목 복사 실행
              </button>
            )}

            {!isRejected && detail.status !== 'editing' && (
              <button
                type="button"
                onClick={() => setRejectModalOpen(true)}
                disabled={isProcessing}
                className="app-btn app-btn--danger"
              >
                반려 처리
              </button>
            )}

            {detail.status === 'search_done' && (
              <button
                type="button"
                onClick={() => setApproveConfirmOpen(true)}
                disabled={isProcessing || !allItemsHaveSelectedFile}
                className="app-btn app-btn--primary"
                title={!allItemsHaveSelectedFile ? '모든 항목에 선택된 파일이 필요합니다.' : ''}
              >
                선택된 항목 승인 복사
              </button>
            )}
          </div>
        </div>
      )}

      <RequestActionDialogs
        detailStatus={detail.status}
        approveConfirmOpen={approveConfirmOpen}
        retryConfirmOpen={retryConfirmOpen}
        retryCopyConfirmOpen={retryCopyConfirmOpen}
        deleteCopiedFileConfirmOpen={deleteCopiedFileConfirmOpen}
        deleteConfirmOpen={deleteConfirmOpen}
        rejectModalOpen={rejectModalOpen}
        rejectReason={rejectReason}
        resendModalOpen={resendModalOpen}
        resendReason={resendReason}
        onApproveCancel={() => setApproveConfirmOpen(false)}
        onApproveConfirm={handleApproveConfirm}
        onRetryCancel={() => setRetryConfirmOpen(false)}
        onRetryConfirm={handleRetryConfirm}
        onRetryCopyCancel={() => setRetryCopyConfirmOpen(false)}
        onRetryCopyConfirm={handleRetryCopyConfirm}
        onDeleteCopiedFileCancel={() => setDeleteCopiedFileConfirmOpen(false)}
        onDeleteCopiedFileConfirm={handleDeleteCopiedFileConfirm}
        onDeleteCancel={() => setDeleteConfirmOpen(false)}
        onDeleteConfirm={handleDeleteConfirm}
        onRejectOpenChange={setRejectModalOpen}
        onRejectReasonChange={setRejectReason}
        onRejectConfirm={handleRejectConfirm}
        onResendOpenChange={setResendModalOpen}
        onResendReasonChange={setResendReason}
        onResendConfirm={handleResendConfirm}
      />
    </div>
  );
}
