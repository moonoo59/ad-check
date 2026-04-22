/**
 * 화면 1: 요청 등록 폼 페이지
 *
 * 동적 요청 행(채널/영업담당자/광고주/일자/시간대) 구조.
 * react-hook-form으로 동적 행 배열 관리.
 *
 * 주요 동작:
 * - 채널 목록: 마운트 시 1회 로드 (is_active=1만)
 * - 행 추가: 최소 1행, 최대 20행 권장
 * - 행 단위 복사/붙여넣기 지원
 * - 날짜 입력은 기존 필드 형태를 유지
 * - 취소 버튼: 입력 내용 있으면 확인 다이얼로그
 * - 등록 성공: 요청 상세 화면으로 이동
 */

import { useState, useEffect, useMemo } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { FilePlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createRequest, getChannels } from '../lib/apiService';
import { normalizeTimeInput, TIME_RANGE_OPTIONS, timeToSeconds } from '../lib/requestTime';
import type { ChannelMapping } from '../types';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/ToastMessage';
import { useAuth } from '../contexts/AuthContext';

interface ItemFormData {
  channel_mapping_id: string;
  sales_manager: string;
  advertiser: string;
  broadcast_date: string;
  req_time_start: string;
  req_time_end: string;
  monitoring_time: string;
  item_memo: string;
}

interface FormData {
  items: ItemFormData[];
}

const MAX_ROWS = 20;

function parseAssignedChannels(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((channel): channel is string => typeof channel === 'string')
      : [];
  } catch {
    return [];
  }
}

const defaultItem = (): ItemFormData => ({
  channel_mapping_id: '',
  sales_manager: '',
  advertiser: '',
  broadcast_date: '',
  req_time_start: '',
  req_time_end: '',
  monitoring_time: '',
  item_memo: '',
});

export default function RequestNewPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [channels, setChannels] = useState<ChannelMapping[]>([]);
  const [channelLoading, setChannelLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(null);
  const [copiedItem, setCopiedItem] = useState<ItemFormData | null>(null);

  useEffect(() => {
    getChannels(false)
      .then(setChannels)
      .catch(() => showToast('채널 목록 로드 실패', 'error'))
      .finally(() => setChannelLoading(false));
  }, [showToast]);

  const assignedChannels = useMemo(
    () => parseAssignedChannels(user?.assigned_channels),
    [user?.assigned_channels],
  );
  const isChannelRestricted = user?.role === 'ad_team';
  const availableChannels = useMemo(
    () => (
      isChannelRestricted
        ? channels.filter((channel) => assignedChannels.includes(channel.display_name))
        : channels
    ),
    [assignedChannels, channels, isChannelRestricted],
  );
  const isRegistrationBlocked = isChannelRestricted && !channelLoading && availableChannels.length === 0;
  const isFormDisabled = isSubmitting || isRegistrationBlocked;

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    defaultValues: {
      items: [defaultItem()],
    },
  });

  const { fields, append, insert, remove } = useFieldArray({ control, name: 'items' });
  const watchedItems = watch('items');

  const onSubmit = async (data: FormData) => {
    if (isRegistrationBlocked) {
      showToast('담당 채널이 지정되지 않았습니다. 관리자에게 문의하세요.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const req = await createRequest({
        items: data.items.map((item, idx) => ({
          channel_mapping_id: Number(item.channel_mapping_id),
          sales_manager: item.sales_manager.trim(),
          advertiser: item.advertiser.trim(),
          broadcast_date: item.broadcast_date,
          req_time_start: item.req_time_start,
          req_time_end: item.req_time_end,
          monitoring_time: normalizeTimeInput(item.monitoring_time) ?? item.monitoring_time,
          item_memo: item.item_memo.trim() || undefined,
          sort_order: idx + 1,
        })),
      });
      showToast('요청이 등록되었습니다.', 'success');
      navigate(`/requests/${req.id}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showToast(msg ?? '등록에 실패했습니다. 다시 시도해주세요.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (isDirty) {
      setShowCancelConfirm(true);
    } else {
      navigate('/requests');
    }
  };

  const handleRemoveRow = (index: number) => {
    if (fields.length <= 1) return;
    const item = watchedItems[index];
    const hasContent = Object.values(item).some((v) => v !== '');
    if (hasContent) {
      setPendingRemoveIndex(index);
      return;
    }
    remove(index);
  };

  const isMidnightCross = (start: string, end: string) => {
    if (!start || !end) return false;
    return start > end;
  };

  const isMonitoringOutOfRange = (start: string, end: string, monitoring: string) => {
    if (!start || !end || !monitoring) return false;
    if (isMidnightCross(start, end)) return false;

    const startSeconds = timeToSeconds(start);
    const endSeconds = timeToSeconds(end);
    const monitoringSeconds = timeToSeconds(monitoring);

    if (startSeconds === null || endSeconds === null || monitoringSeconds === null) {
      return false;
    }

    return monitoringSeconds < startSeconds || monitoringSeconds > endSeconds;
  };

  const cloneItem = (item?: ItemFormData): ItemFormData => ({
    channel_mapping_id: item?.channel_mapping_id ?? '',
    sales_manager: item?.sales_manager ?? '',
    advertiser: item?.advertiser ?? '',
    broadcast_date: item?.broadcast_date ?? '',
    req_time_start: item?.req_time_start ?? '',
    req_time_end: item?.req_time_end ?? '',
    monitoring_time: item?.monitoring_time ?? '',
    item_memo: item?.item_memo ?? '',
  });

  const handleCopyRow = (index: number) => {
    setCopiedItem(cloneItem(watchedItems[index]));
    showToast(`${index + 1}번 행을 복사했습니다.`, 'success');
  };

  const handlePasteRow = (index: number) => {
    if (!copiedItem) {
      showToast('먼저 복사할 행을 선택해주세요.', 'warning');
      return;
    }

    if (fields.length >= MAX_ROWS) {
      showToast(`행은 최대 ${MAX_ROWS}개까지 추가할 수 있습니다.`, 'warning');
      return;
    }

    insert(index + 1, cloneItem(copiedItem));
    showToast(`${index + 2}번 위치에 복사한 행을 추가했습니다.`, 'success');
  };

  const inputClass = (hasError: boolean) =>
    `app-field app-field--dense ${
      hasError ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-200' : ''
    }`;

  return (
    <div className="app-page">
      <PageHeader
        title="광고 증빙 요청 등록"
        subtitle="반복되는 항목은 행 복사와 붙여넣기로 바로 아래에 빠르게 추가할 수 있습니다."
        icon={FilePlus}
      >
        <button
          type="button"
          onClick={handleCancel}
          disabled={isSubmitting}
          className="app-btn app-btn--secondary"
        >
          취소
        </button>
        <button
          type="submit"
          form="request-form"
          disabled={isFormDisabled}
          className="app-btn app-btn--primary"
        >
          {isSubmitting ? '처리 중...' : '등록 제출'}
        </button>
      </PageHeader>

      <form id="request-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="app-toolbar-card app-toolbar-card--compact mb-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="app-label mb-0">요청 안내 사항</p>
              <p className="text-base font-semibold text-[var(--app-text)]">
                날짜, 시간대, 송출 시간이 달라지면 항목을 나눠 입력해주세요.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="app-chip">행 복사·붙여넣기</span>
              <span className="app-chip">최대 {MAX_ROWS}행</span>
              {isChannelRestricted && (
                <span className="app-chip">담당 채널 {availableChannels.length}개</span>
              )}
            </div>
          </div>

          {isChannelRestricted && (
            <div className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${
              isRegistrationBlocked
                ? 'border-rose-200 bg-[rgba(255,244,244,0.96)] text-rose-700'
                : 'border-[var(--app-border)] bg-[rgba(255,252,248,0.95)] text-[var(--app-text-soft)]'
            }`}>
              <p className="font-semibold text-[var(--app-text)]">내 담당 채널</p>
              {availableChannels.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {availableChannels.map((channel) => (
                    <span
                      key={channel.id}
                      className="inline-flex rounded-full border border-[var(--app-border)] bg-white/70 px-2.5 py-1 text-xs font-semibold text-[var(--app-text-soft)]"
                    >
                      {channel.display_name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1">담당 채널이 지정되지 않았습니다. 관리자에게 문의하세요.</p>
              )}
            </div>
          )}

          <ul className="mt-3 grid gap-x-5 gap-y-2 text-sm leading-6 text-[var(--app-text-soft)] md:grid-cols-2 xl:grid-cols-4">
            <li>같은 광고주라도 방송일자나 시간대가 다르면 별도 행으로 입력하세요.</li>
            <li>반복 항목은 오른쪽 작업 열의 복사, 붙여넣기로 바로 아래 행에 추가할 수 있습니다.</li>
            <li>
              송출 시간은 <strong className="font-semibold text-[var(--app-text)]">HH:MM</strong> 또는 <strong className="font-semibold text-[var(--app-text)]">HH:MM:SS</strong> 형식으로 입력하세요.
            </li>
            <li>
              {isChannelRestricted
                ? '담당 채널만 표시됩니다. 필요한 채널이 없으면 관리자에게 문의하세요.'
                : '활성 채널만 표시됩니다. 필요한 채널이 없으면 관리자에게 채널 매핑 상태를 확인해주세요.'}
            </li>
          </ul>
        </div>

        {isRegistrationBlocked && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-[rgba(255,244,244,0.96)] px-4 py-3 text-sm text-rose-700">
            담당 채널이 없어 요청을 등록할 수 없습니다. 관리자에게 담당 채널 배정을 요청하세요.
          </div>
        )}

        <div className="app-table-shell app-table-shell--flat mb-4">
          <table className="app-table app-table--compact app-table--fixed text-sm">
              <thead>
                <tr>
                  <th className="w-[52px] text-center">#</th>
                  <th className="w-[132px]">
                    채널 <span className="text-red-500">*</span>
                  </th>
                  <th className="w-[150px]">
                    영업담당자 <span className="text-red-500">*</span>
                  </th>
                  <th className="w-[150px]">
                    광고주 <span className="text-red-500">*</span>
                  </th>
                  <th className="w-[132px]">
                    방송일자 <span className="text-red-500">*</span>
                  </th>
                  <th className="w-[150px]">
                    시간대 <span className="text-red-500">*</span>
                  </th>
                  <th className="w-[128px]">
                    송출 시간 <span className="text-red-500">*</span>
                  </th>
                  <th className="w-[120px]">메모</th>
                  <th className="w-[156px] text-center">작업</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => {
                  const item = watchedItems[index] ?? defaultItem();
                  const midnightCross = isMidnightCross(item.req_time_start, item.req_time_end);
                  const monitoringWarn = isMonitoringOutOfRange(
                    item.req_time_start,
                    item.req_time_end,
                    item.monitoring_time,
                  );
                  const itemErrors = errors.items?.[index];

                  return (
                    <tr key={field.id} className="transition-colors hover:bg-[rgba(120,88,68,0.045)]">
                      <td className="text-center text-xs text-[var(--app-text-faint)]">{index + 1}</td>

                      <td>
                        <select
                          {...register(`items.${index}.channel_mapping_id`, {
                            required: '채널을 선택하세요.',
                          })}
                          aria-required="true"
                          disabled={channelLoading || isFormDisabled}
                          className={`${inputClass(!!itemErrors?.channel_mapping_id)} bg-[rgba(255,252,248,0.95)]`}
                        >
                          <option value="">
                            {channelLoading ? '로딩 중...' : '채널 선택'}
                          </option>
                          {availableChannels.map((ch) => (
                            <option key={ch.id} value={ch.id}>
                              {ch.display_name} ({ch.storage_folder})
                            </option>
                          ))}
                        </select>
                        {itemErrors?.channel_mapping_id && (
                          <p className="mt-1 text-xs text-rose-600">
                            {itemErrors.channel_mapping_id.message}
                          </p>
                        )}
                      </td>

                      <td>
                        <input
                          type="text"
                          {...register(`items.${index}.sales_manager`, {
                            required: '영업담당자를 입력하세요.',
                            maxLength: { value: 50, message: '50자 이하' },
                          })}
                          aria-required="true"
                          disabled={isFormDisabled}
                          className={inputClass(!!itemErrors?.sales_manager)}
                          placeholder="영업담당자명"
                        />
                        {itemErrors?.sales_manager && (
                          <p className="mt-1 text-xs text-rose-600">{itemErrors.sales_manager.message}</p>
                        )}
                      </td>

                      <td>
                        <input
                          type="text"
                          {...register(`items.${index}.advertiser`, {
                            required: '광고주를 입력하세요.',
                            maxLength: { value: 100, message: '100자 이하' },
                          })}
                          aria-required="true"
                          disabled={isFormDisabled}
                          className={inputClass(!!itemErrors?.advertiser)}
                          placeholder="광고주명"
                        />
                        {itemErrors?.advertiser && (
                          <p className="mt-1 text-xs text-rose-600">{itemErrors.advertiser.message}</p>
                        )}
                      </td>

                      <td className="align-top">
                        <input
                          type="date"
                          {...register(`items.${index}.broadcast_date`, {
                            required: '방송일자를 입력하세요.',
                          })}
                          disabled={isFormDisabled}
                          className={inputClass(!!itemErrors?.broadcast_date)}
                        />
                        {itemErrors?.broadcast_date && (
                          <p className="mt-1 text-xs text-rose-600">{itemErrors.broadcast_date.message}</p>
                        )}
                      </td>

                      <td>
                        <input
                          type="hidden"
                          {...register(`items.${index}.req_time_start`, { required: '시간대를 선택하세요.' })}
                        />
                        <input
                          type="hidden"
                          {...register(`items.${index}.req_time_end`, { required: true })}
                        />
                        <select
                          value={item.req_time_start || ''}
                          onChange={(event) => {
                            const option = TIME_RANGE_OPTIONS.find((entry) => entry.start === event.target.value);
                            setValue(`items.${index}.req_time_start`, option?.start ?? '', { shouldValidate: true });
                            setValue(`items.${index}.req_time_end`, option?.end ?? '', { shouldValidate: true });
                          }}
                          disabled={isFormDisabled}
                          className={`${inputClass(!!itemErrors?.req_time_start)} bg-[rgba(255,252,248,0.95)]`}
                        >
                          <option value="">시간대 선택</option>
                          {TIME_RANGE_OPTIONS.map((option) => (
                            <option key={option.start} value={option.start}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {itemErrors?.req_time_start && (
                          <p className="mt-1 text-xs text-rose-600">{itemErrors.req_time_start.message}</p>
                        )}
                        {midnightCross && (
                          <p className="mt-1 text-xs text-[var(--app-primary)]">자정 넘김 요청</p>
                        )}
                      </td>

                      <td>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="13:11:00"
                          maxLength={8}
                          {...register(`items.${index}.monitoring_time`, {
                            required: '송출 시간을 입력하세요.',
                            validate: (value) => !!normalizeTimeInput(value) || 'HH:MM 또는 HH:MM:SS (24시간)',
                          })}
                          aria-required="true"
                          disabled={isFormDisabled}
                          className={`${inputClass(!!itemErrors?.monitoring_time)} ${
                            monitoringWarn ? 'border-yellow-400 focus:ring-yellow-400' : ''
                          }`}
                        />
                        {itemErrors?.monitoring_time && (
                          <p className="mt-1 text-xs text-rose-600">{itemErrors.monitoring_time.message}</p>
                        )}
                        {monitoringWarn && (
                          <p className="mt-1 text-xs text-amber-700">요청 시간대 밖입니다.</p>
                        )}
                      </td>

                      <td>
                        <input
                          type="text"
                          {...register(`items.${index}.item_memo`, {
                            maxLength: { value: 200, message: '200자 이하' },
                          })}
                          disabled={isFormDisabled}
                          className="app-field app-field--dense"
                          placeholder="메모 (선택)"
                        />
                      </td>

                      <td>
                        <div className="flex flex-wrap items-center justify-center gap-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleCopyRow(index)}
                            disabled={isFormDisabled}
                            className="app-btn app-btn--secondary app-btn--sm"
                          >
                            복사
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePasteRow(index)}
                            disabled={isFormDisabled || !copiedItem || fields.length >= MAX_ROWS}
                            className="app-btn app-btn--soft app-btn--sm"
                          >
                            붙여넣기
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(index)}
                            disabled={isFormDisabled || fields.length <= 1}
                            className="app-btn app-btn--ghost app-btn--sm"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (fields.length >= MAX_ROWS) {
                showToast(`행은 최대 ${MAX_ROWS}개까지 추가할 수 있습니다.`, 'warning');
                return;
              }
              append(defaultItem());
            }}
            disabled={isFormDisabled}
            className="app-btn app-btn--secondary"
          >
            행 추가
          </button>
          {fields.length >= MAX_ROWS && (
            <span className="text-xs text-amber-700">최대 {MAX_ROWS}행에 도달했습니다.</span>
          )}
          {availableChannels.length === 0 && !channelLoading && (
            <span className="text-xs text-rose-700">
              {isChannelRestricted
                ? '담당 채널이 없습니다. 관리자에게 문의하세요.'
                : '등록된 활성 채널이 없습니다. 관리자에게 문의하세요.'}
            </span>
          )}
        </div>
      </form>

      <ConfirmDialog
        open={showCancelConfirm}
        title="등록 취소"
        message="작성 중인 내용이 사라집니다. 취소하시겠습니까?"
        confirmLabel="취소하기"
        cancelLabel="계속 작성"
        confirmVariant="red"
        onConfirm={() => navigate('/requests')}
        onCancel={() => setShowCancelConfirm(false)}
      />

      <ConfirmDialog
        open={pendingRemoveIndex !== null}
        title="행 삭제"
        message="이 행의 입력 내용이 사라집니다. 삭제하시겠습니까?"
        confirmLabel="삭제"
        cancelLabel="유지"
        confirmVariant="red"
        onConfirm={() => {
          if (pendingRemoveIndex !== null) {
            remove(pendingRemoveIndex);
          }
          setPendingRemoveIndex(null);
        }}
        onCancel={() => setPendingRemoveIndex(null)}
      />
    </div>
  );
}
