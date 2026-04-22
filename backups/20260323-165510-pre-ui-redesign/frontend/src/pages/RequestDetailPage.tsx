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
import { useAuth } from '../contexts/AuthContext';
import {
  approveRequest,
  deleteCopiedFile,
  deleteRequest,
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
import type {
  ChannelMapping,
  CopyJob,
  FileSearchResult,
  RequestDetail,
  RequestItem,
} from '../types';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import InfoCard from '../components/InfoCard';
import FileSizeDisplay from '../components/FileSizeDisplay';
import ConfirmDialog from '../components/ConfirmDialog';
import ErrorBanner from '../components/ErrorBanner';
import { useToast } from '../components/ToastMessage';

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

const TIME_RANGE_OPTIONS = Array.from({ length: 24 }, (_, h) => {
  const startH = String(h).padStart(2, '0');
  const endH = String((h + 1) % 24).padStart(2, '0');
  return {
    start: `${startH}:00`,
    end: `${endH}:00`,
    label: `${startH}:00 ~ ${endH}:00${h === 23 ? ' (자정 넘김)' : ''}`,
  };
});

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function fmtDatetime(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function normalizeTimeInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 4) {
    const formatted = `${digits.slice(0, 2)}:${digits.slice(2)}`;
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(formatted) ? formatted : null;
  }

  return null;
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

function CopyProgressRow({ item }: { item: ItemWithResults }) {
  const job = item.copy_job;
  if (!job) return null;

  const percent =
    job.total_bytes && job.total_bytes > 0
      ? Math.min(100, Math.round((job.progress_bytes / job.total_bytes) * 100))
      : null;

  const isDone = job.status === 'done';
  const isFailed = job.status === 'failed';
  const srcFileName = job.source_path.split('/').pop() ?? job.source_path;
  const destDir = job.dest_path.split('/').slice(0, -1).join('/');

  return (
    <div className={`px-4 py-3 rounded border text-xs ${
      isDone ? 'bg-green-50 border-green-200' :
      isFailed ? 'bg-red-50 border-red-200' :
      'bg-white border-gray-200'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-gray-700">
          {item.channel_display_name} / {item.advertiser}
        </span>
        <span className={`font-semibold tabular-nums ${
          isDone ? 'text-green-600' :
          isFailed ? 'text-red-600' :
          'text-blue-600'
        }`}>
          {isDone ? '완료' : isFailed ? '실패' : percent !== null ? `${percent}%` : '복사 중…'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2 text-gray-500">
        <div>
          <span className="text-gray-400 mr-1">소스:</span>
          <span className="font-mono" title={job.source_path}>{srcFileName}</span>
        </div>
        <div>
          <span className="text-gray-400 mr-1">목적지:</span>
          <span className="font-mono" title={job.dest_path}>{destDir}/</span>
        </div>
      </div>

      {!isFailed && (
        <div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            {percent !== null ? (
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  isDone ? 'bg-green-500' : 'bg-blue-500'
                }`}
                style={{ width: `${percent}%` }}
              />
            ) : (
              <div className="h-2 w-1/3 rounded-full bg-blue-400 animate-pulse" />
            )}
          </div>
          {job.total_bytes && (
            <div className="mt-1 text-gray-400 text-right tabular-nums">
              {fmtBytes(job.progress_bytes)} / {fmtBytes(job.total_bytes)}
            </div>
          )}
        </div>
      )}

      {isFailed && job.error_message && (
        <div className="mt-1 text-red-600">{job.error_message}</div>
      )}
    </div>
  );
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
    if (user?.role !== 'tech_team' && user?.role !== 'admin') {
      return;
    }

    getChannels(false).then(setChannels).catch(() => {
      showToast('채널 목록을 불러오지 못했습니다.', 'error');
    });
  }, [showToast, user?.role]);

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
      <div className="max-w-screen-xl mx-auto px-6 py-6">
        <div className="text-sm text-gray-400">로딩 중...</div>
      </div>
    );
  }

  if (loadError || !detail) {
    return (
      <div className="max-w-screen-xl mx-auto px-6 py-6">
        <ErrorBanner message={loadError || '요청을 찾을 수 없습니다.'} onRetry={loadDetail} />
      </div>
    );
  }

  const items: ItemWithResults[] = detail.items ?? [];
  const selectedItem = items[selectedItemIdx] ?? items[0];
  const canAct = user?.role === 'tech_team' || user?.role === 'admin';
  const isRejected = detail.status === 'rejected';
  const isCopyFailed = detail.status === 'failed' && items.some((item) => item.copy_job !== null);
  const isSearchFailed = detail.status === 'failed' && !isCopyFailed;
  const isApprovedPendingCopy = detail.status === 'approved';
  const editingTargets = items.filter((item) => item.item_status !== 'done');
  const hasEditingSearchInProgress = editingTargets.some((item) => item.item_status === 'searching');
  const allItemsHaveSelectedFile = items.every((item) =>
    item.file_search_results.some((file) => file.is_selected === 1 && file.match_score === 100),
  );
  const hasUnselectedPerfectItem = items.some((item) => {
    const hasPerfect = item.file_search_results.some((file) => file.match_score === 100);
    const hasSelected100 = item.file_search_results.some((file) => file.is_selected === 1 && file.match_score === 100);
    return hasPerfect && !hasSelected100;
  });
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

        const perfectFile = item.file_search_results.find((file) => file.match_score === 100);
        if (perfectFile) {
          await selectFile(item.id, { file_search_result_id: perfectFile.id });
          selectedCount += 1;
        }
      }

      if (selectedCount > 0) {
        await loadDetail();
        showToast(`${selectedCount}개 항목에 100% 파일이 자동 선택되었습니다.`, 'success');
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

  const handleDeleteCopiedFile = async () => {
    if (!selectedItem?.copy_job?.id || !selectedItemHasActiveCopy) {
      return;
    }

    if (!confirm('공유 NAS의 복사 파일을 삭제하시겠습니까? 파일이 없어도 삭제 처리로 기록됩니다.')) {
      return;
    }

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
      showToast('송출 시간은 HH:MM 형식으로 입력해주세요.', 'warning');
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
    <div className="max-w-screen-xl mx-auto px-6 py-6">
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => navigate('/requests')}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← 목록으로
        </button>
        <PageHeader title={`요청 #${detail.id} 상세`} />
        {user?.role === 'admin' && (
          <button
            type="button"
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={isProcessing || detail.status === 'copying' || detail.status === 'searching'}
            className="ml-auto px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            요청 삭제
          </button>
        )}
      </div>

      <InfoCard
        className="mb-5"
        items={[
          { label: '요청자', value: detail.requester_name ?? '-' },
          { label: '요청일시', value: fmtDatetime(detail.created_at) },
          { label: '상태', value: <StatusBadge status={detail.status} /> },
          { label: '검토자', value: detail.reviewed_by_name ?? '-' },
          { label: '검토일시', value: fmtDatetime(detail.reviewed_at) },
          {
            label: '요청 메모',
            value: detail.request_memo || '-',
            span: true,
          },
          ...(isRejected
            ? [{ label: '반려 사유', value: <span className="text-red-600">{detail.reject_reason}</span>, span: true as const }]
            : []),
        ]}
      />

      {detail.status === 'done' && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded text-sm text-green-700 flex items-center justify-between">
          <span>✓ 이 요청은 처리 완료되었습니다.</span>
          <button
            type="button"
            onClick={() => setResendModalOpen(true)}
            disabled={isProcessing}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs disabled:opacity-50"
          >
            재전송 요청
          </button>
        </div>
      )}

      {detail.status === 'editing' && (
        <div className="mb-4 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-700">
          <div className="font-medium">요청 수정중</div>
          <div className="mt-1 text-xs">
            수정 대상 항목만 다시 탐색하고 복사할 수 있습니다.
            {hasEditingSearchInProgress ? ' 탐색 중인 항목이 있어 5초마다 자동 갱신됩니다.' : ''}
          </div>
        </div>
      )}

      {isApprovedPendingCopy && canAct && (
        <div className="mb-4 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-700 flex items-center justify-between">
          <span>재전송 요청이 등록되어 있습니다. 파일 선택을 확인 후 복사를 실행하세요.</span>
          <button
            type="button"
            onClick={() => setRetryCopyConfirmOpen(true)}
            disabled={isProcessing}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs disabled:opacity-50"
          >
            복사 실행
          </button>
        </div>
      )}

      {detail.status === 'searching' && (
        <div className="mb-4 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-700 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse inline-block" />
          파일 탐색이 진행 중입니다. 5초마다 자동 갱신됩니다.
        </div>
      )}

      {detail.status === 'copying' && (
        <div className="mb-4">
          <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700 flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse inline-block" />
            파일 복사가 진행 중입니다. 10초마다 자동 갱신됩니다.
          </div>
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <CopyProgressRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-5 gap-5">
        <div className="col-span-2">
          <h2 className="text-sm font-medium text-gray-700 mb-2">요청 항목</h2>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-gray-500 w-8">#</th>
                  <th className="px-3 py-2 text-left text-gray-500">채널</th>
                  <th className="px-3 py-2 text-left text-gray-500">영업담당자</th>
                  <th className="px-3 py-2 text-left text-gray-500">광고주</th>
                  <th className="px-3 py-2 text-left text-gray-500">방송송출일자</th>
                  <th className="px-3 py-2 text-left text-gray-500">시간대</th>
                  <th className="px-3 py-2 text-left text-gray-500">상태</th>
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item, idx) => {
                  const hasSelected = item.file_search_results.some((file) => file.is_selected === 1 && file.match_score === 100);
                  const isSelected = idx === selectedItemIdx;
                  const isDeletedCopy = !!item.copy_job?.deleted_at;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedItemIdx(idx)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => event.key === 'Enter' && setSelectedItemIdx(idx)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'border-l-2 border-l-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                      } ${item.item_status === 'failed' ? 'bg-red-50' : ''}`}
                    >
                      <td className="px-3 py-2 text-gray-400">{item.sort_order}</td>
                      <td className="px-3 py-2 font-medium">{item.channel_display_name ?? item.channel_mapping_id}</td>
                      <td className="px-3 py-2 text-gray-600">{item.sales_manager}</td>
                      <td className="px-3 py-2 text-gray-600">{item.advertiser}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-500 whitespace-nowrap">{item.broadcast_date}</td>
                      <td className="px-3 py-2 text-gray-500 tabular-nums whitespace-nowrap">
                        {item.req_time_start}~{item.req_time_end}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={item.item_status} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        {isDeletedCopy ? (
                          <span className="text-gray-400 text-[10px]">삭제</span>
                        ) : hasSelected ? (
                          <span className="text-green-500 text-sm">✓</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-3">
          {selectedItem && (
            <div>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium text-gray-700">파일 탐색 결과</h2>
                  <span className="text-xs text-gray-400">
                    {selectedItem.channel_display_name} / {selectedItem.advertiser} / {selectedItem.broadcast_date}
                  </span>
                </div>

                {canAct && (
                  <div className="flex gap-2">
                    {canStartCorrection && (
                      editingItemId === selectedItem.id ? (
                        <button
                          type="button"
                          onClick={cancelCorrection}
                          disabled={isProcessing}
                          className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                          수정 취소
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={startCorrection}
                          disabled={isProcessing}
                          className="rounded border border-blue-300 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
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
                        className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        파일 삭제
                      </button>
                    )}
                  </div>
                )}
              </div>

              {selectedItem.item_status === 'done' && (
                <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                  ✓ 이 항목은 복사가 완료되었습니다.
                </div>
              )}

              {selectedItem.copy_job?.deleted_at && (
                <div className="mb-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600">
                  이 항목의 공유 NAS 복사본은 삭제 처리되었습니다. 필요 시 오전송 수정 또는 재전송 흐름으로 다시 복사할 수 있습니다.
                </div>
              )}

              {editingItemId === selectedItem.id && (
                <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <h3 className="mb-3 text-sm font-semibold text-blue-900">오전송 수정</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-blue-900">채널</label>
                      <select
                        value={editForm.channel_mapping_id}
                        onChange={(event) => setEditForm((prev) => ({
                          ...prev,
                          channel_mapping_id: event.target.value,
                        }))}
                        className="w-full rounded border border-blue-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
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
                      <label className="mb-1 block text-xs font-medium text-blue-900">방송일자</label>
                      <input
                        type="date"
                        value={editForm.broadcast_date}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, broadcast_date: event.target.value }))}
                        className="w-full rounded border border-blue-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-blue-900">시간대</label>
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
                        className="w-full rounded border border-blue-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
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
                      <label className="mb-1 block text-xs font-medium text-blue-900">송출 시간</label>
                      <input
                        type="text"
                        value={editForm.monitoring_time}
                        inputMode="numeric"
                        maxLength={5}
                        onChange={(event) => setEditForm((prev) => ({
                          ...prev,
                          monitoring_time: event.target.value,
                        }))}
                        className="w-full rounded border border-blue-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                        placeholder="HH:MM"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-xs text-blue-800">
                      저장하면 기존 복사본과 탐색 결과를 정리한 뒤 해당 항목만 다시 탐색합니다.
                    </p>
                    <button
                      type="button"
                      onClick={handleCorrectionSave}
                      disabled={isProcessing}
                      className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      수정 저장
                    </button>
                  </div>
                </div>
              )}

              {(() => {
                const perfectFiles = selectedItem.file_search_results.filter((file) => file.match_score === 100);
                const hasTotalResults = selectedItem.file_search_results.length > 0;

                if (!hasTotalResults) {
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
                      <p className="mb-1">이 항목에 대해 탐색된 파일이 없습니다.</p>
                      <p className="text-xs text-gray-400">탐색이 완료되지 않았거나 해당 날짜/채널에 파일이 존재하지 않을 수 있습니다.</p>
                    </div>
                  );
                }

                if (perfectFiles.length === 0) {
                  return (
                    <div className="bg-white border border-yellow-200 rounded-lg p-6 text-center text-sm text-yellow-700">
                      <p className="mb-1">정확도 100% 파일이 없습니다.</p>
                      <p className="text-xs text-yellow-600">
                        탐색된 파일 {selectedItem.file_search_results.length}건 중 정확도 100% 파일이 없습니다.
                        탐색 재시도를 통해 다시 확인해주세요.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-3 py-2 w-10" />
                            <th className="px-3 py-2 text-left text-gray-500">파일명</th>
                            <th className="px-3 py-2 text-left text-gray-500 w-20">크기</th>
                            <th className="px-3 py-2 text-left text-gray-500 w-20">시작</th>
                            <th className="px-3 py-2 text-left text-gray-500 w-20">종료</th>
                            <th className="px-3 py-2 text-left text-gray-500">근거</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {perfectFiles.map((file) => {
                            const isDoneItem = selectedItem.item_status === 'done' && detail.status !== 'editing';
                            return (
                              <tr key={file.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2 text-center">
                                  <input
                                    type="radio"
                                    name={`file-select-${selectedItem.id}`}
                                    checked={file.is_selected === 1}
                                    onChange={() => handleSelectFile(selectedItem.id, file.id)}
                                    disabled={!canAct || isDoneItem || isProcessing}
                                    className="cursor-pointer disabled:cursor-not-allowed"
                                  />
                                </td>
                                <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{file.file_name}</td>
                                <td className="px-3 py-2">
                                  <FileSizeDisplay bytes={file.file_size_bytes} />
                                </td>
                                <td className="px-3 py-2 tabular-nums text-gray-500">{file.file_start_time}</td>
                                <td className="px-3 py-2 tabular-nums text-gray-500">{file.file_end_time}</td>
                                <td className="px-3 py-2 text-gray-500 max-w-xs truncate" title={file.match_reason}>
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
            </div>
          )}
        </div>
      </div>

      {canAct && detail.status !== 'done' && detail.status !== 'copying' && (
        <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
          <div className="flex gap-2 items-center">
            {isProcessing && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin inline-block" />
                처리 중...
              </span>
            )}

            {(isSearchFailed || detail.status === 'search_done') && (
              <button
                type="button"
                onClick={() => setRetryConfirmOpen(true)}
                disabled={isProcessing}
                className="px-4 py-2 text-sm border border-gray-300 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                탐색 재시도
              </button>
            )}

            {detail.status === 'search_done' && hasUnselectedPerfectItem && (
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={isProcessing}
                className="px-4 py-2 text-sm border border-green-300 text-green-700 rounded hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                전체 선택
              </button>
            )}

            {isCopyFailed && (
              <button
                type="button"
                onClick={() => setRetryCopyConfirmOpen(true)}
                disabled={isProcessing}
                className="px-4 py-2 text-sm border border-orange-300 text-orange-600 rounded hover:bg-orange-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                복사 재시도
              </button>
            )}
          </div>

          <div className="flex gap-2">
            {detail.status === 'editing' && (
              <button
                type="button"
                onClick={() => setRetryCopyConfirmOpen(true)}
                disabled={isProcessing || !editingItemsReadyForCopy || hasEditingSearchInProgress}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                title={!editingItemsReadyForCopy ? '수정 중인 항목에 선택된 100% 파일이 필요합니다.' : ''}
              >
                수정 항목 복사 실행
              </button>
            )}

            {!isRejected && detail.status !== 'editing' && (
              <button
                type="button"
                onClick={() => setRejectModalOpen(true)}
                disabled={isProcessing}
                className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                반려 처리
              </button>
            )}

            {detail.status === 'search_done' && (
              <button
                type="button"
                onClick={() => setApproveConfirmOpen(true)}
                disabled={isProcessing || !allItemsHaveSelectedFile}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                title={!allItemsHaveSelectedFile ? '모든 항목에 100% 파일을 선택해야 합니다.' : ''}
              >
                선택된 항목 승인 복사
              </button>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={approveConfirmOpen}
        title="선택된 항목 승인 복사"
        message="선택된 파일을 공유 NAS로 복사합니다. 이 작업은 취소할 수 없습니다. 계속하시겠습니까?"
        confirmLabel="승인 및 복사"
        onConfirm={handleApproveConfirm}
        onCancel={() => setApproveConfirmOpen(false)}
      />

      <ConfirmDialog
        open={retryConfirmOpen}
        title="탐색 재시도"
        message="기존 탐색 결과가 초기화됩니다. 탐색을 재실행하시겠습니까?"
        confirmLabel="재시도"
        onConfirm={handleRetryConfirm}
        onCancel={() => setRetryConfirmOpen(false)}
      />

      <ConfirmDialog
        open={retryCopyConfirmOpen}
        title={detail.status === 'editing' ? '수정 항목 복사 실행' : '복사 재시도'}
        message={
          detail.status === 'editing'
            ? '수정 중인 항목만 다시 복사합니다. 계속하시겠습니까?'
            : '실패한 항목만 다시 복사합니다. 계속하시겠습니까?'
        }
        confirmLabel="복사 실행"
        onConfirm={handleRetryCopyConfirm}
        onCancel={() => setRetryCopyConfirmOpen(false)}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="요청 삭제"
        message="이 요청을 삭제하시겠습니까? 삭제 후 복구할 수 없습니다."
        confirmLabel="삭제"
        confirmVariant="red"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      {rejectModalOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-white rounded-lg shadow-lg border border-gray-200 p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-3">반려 사유 입력</h3>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              rows={4}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              placeholder="반려 사유를 입력하세요. (최소 5자)"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleRejectConfirm}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                반려 처리
              </button>
            </div>
          </div>
        </div>
      )}

      {resendModalOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-white rounded-lg shadow-lg border border-gray-200 p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-3">재전송 사유 입력</h3>
            <textarea
              value={resendReason}
              onChange={(event) => setResendReason(event.target.value)}
              rows={4}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              placeholder="재전송 사유를 입력하세요. (최소 5자)"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResendModalOpen(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleResendConfirm}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                재전송 요청
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
