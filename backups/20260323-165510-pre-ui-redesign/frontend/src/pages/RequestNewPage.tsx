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

import { useState, useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { createRequest, getChannels } from '../lib/apiService';
import type { ChannelMapping } from '../types';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/ToastMessage';

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
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const TIME_RANGE_OPTIONS = Array.from({ length: 24 }, (_, h) => {
  const startH = String(h).padStart(2, '0');
  const endH = String((h + 1) % 24).padStart(2, '0');
  return {
    start: `${startH}:00`,
    end: `${endH}:00`,
    label: `${startH}:00 ~ ${endH}:00${h === 23 ? ' (자정 넘김)' : ''}`,
  };
});

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

function normalizeTimeInput(raw: string): string | null {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  if (TIME_REGEX.test(trimmed)) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 4) {
    const formatted = `${digits.slice(0, 2)}:${digits.slice(2)}`;
    return TIME_REGEX.test(formatted) ? formatted : null;
  }

  return null;
}

export default function RequestNewPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [channels, setChannels] = useState<ChannelMapping[]>([]);
  const [channelLoading, setChannelLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [copiedItem, setCopiedItem] = useState<ItemFormData | null>(null);

  useEffect(() => {
    getChannels(false)
      .then(setChannels)
      .catch(() => showToast('채널 목록 로드 실패', 'error'))
      .finally(() => setChannelLoading(false));
  }, [showToast]);

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
          monitoring_time: item.monitoring_time,
          item_memo: item.item_memo || undefined,
          sort_order: idx + 1,
        })),
      });
      showToast('요청이 등록되었습니다.', 'success');
      navigate(`/requests/${req.id}`);
    } catch {
      showToast('등록에 실패했습니다. 다시 시도해주세요.', 'error');
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
    if (hasContent && !confirm('이 행의 입력 내용이 사라집니다. 삭제하시겠습니까?')) {
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
    return monitoring < start || monitoring > end;
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
    `border rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 ${
      hasError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300 focus:ring-blue-400'
    }`;

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-6">
      <PageHeader title="광고 증빙 요청 등록">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isSubmitting}
          className="px-4 py-2 text-sm border border-gray-300 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="submit"
          form="request-form"
          disabled={isSubmitting}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? '처리 중...' : '등록 제출'}
        </button>
      </PageHeader>

      <form id="request-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-5 text-blue-950 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold">입력 안내</p>
              <p className="mt-1 text-sm leading-6 text-blue-900">
                요청 항목은 아래 기준으로 입력해주세요. 반복되는 항목은 행 복사 기능을 쓰면 훨씬 빠르게 등록할 수 있습니다.
              </p>
            </div>
            <div className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-medium text-blue-700 border border-blue-200">
              빠른 입력 팁
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-blue-200 bg-white px-4 py-3">
              <p className="text-sm font-semibold text-blue-900">1. 항목 구분 기준</p>
              <p className="mt-1 text-sm leading-6 text-blue-800">
                같은 광고주라도 <strong>송출 시간이 다르면 항목을 따로</strong> 추가해주세요.
                시간대가 다르면 파일 탐색도 별도로 진행됩니다.
              </p>
            </div>

            <div className="rounded-lg border border-blue-200 bg-white px-4 py-3">
              <p className="text-sm font-semibold text-blue-900">2. 광고주 입력 방식</p>
              <p className="mt-1 text-sm leading-6 text-blue-800">
                광고주 칸에는 <strong>회사명만 간단히</strong> 입력해주세요.
                캠페인명이나 추가 설명이 필요하면 메모 칸에 적는 방식이 가장 안전합니다.
              </p>
            </div>

            <div className="rounded-lg border border-blue-200 bg-white px-4 py-3">
              <p className="text-sm font-semibold text-blue-900">3. 복사 / 붙여넣기</p>
              <p className="mt-1 text-sm leading-6 text-blue-800">
                먼저 한 행을 입력한 뒤 오른쪽 <strong>[복사]</strong>를 누르고,
                원하는 위치에서 <strong>[붙여넣기]</strong>를 누르면 바로 아래에 같은 내용이 추가됩니다.
              </p>
            </div>

            <div className="rounded-lg border border-blue-200 bg-white px-4 py-3">
              <p className="text-sm font-semibold text-blue-900">4. 날짜 / 메모</p>
              <p className="mt-1 text-sm leading-6 text-blue-800">
                방송일자는 직접 입력하거나 달력에서 선택할 수 있습니다.
                특이사항, 추가 요청, 구분이 필요한 내용은 <strong>메모 칸</strong>에 남겨주세요.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 text-center w-10">#</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 text-left w-28">
                    채널 <span className="text-red-500">*</span>
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 text-left w-28">
                    영업담당자 <span className="text-red-500">*</span>
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 text-left w-36">
                    광고주 <span className="text-red-500">*</span>
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 text-left w-40">
                    방송일자 <span className="text-red-500">*</span>
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 text-left w-44">
                    시간대 <span className="text-red-500">*</span>
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 text-left w-24">
                    송출 시간 <span className="text-red-500">*</span>
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 text-left w-32">메모</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 text-center w-32">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
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
                    <tr key={field.id} className="hover:bg-blue-50 transition-colors">
                      <td className="px-3 py-2 text-center text-gray-400 text-xs">{index + 1}</td>

                      <td className="px-3 py-2">
                        <select
                          {...register(`items.${index}.channel_mapping_id`, {
                            required: '채널을 선택하세요.',
                          })}
                          aria-required="true"
                          disabled={channelLoading}
                          className={`${inputClass(!!itemErrors?.channel_mapping_id)} bg-white`}
                        >
                          <option value="">
                            {channelLoading ? '로딩 중...' : '채널 선택'}
                          </option>
                          {channels.map((ch) => (
                            <option key={ch.id} value={ch.id}>
                              {ch.display_name} ({ch.storage_folder})
                            </option>
                          ))}
                        </select>
                        {itemErrors?.channel_mapping_id && (
                          <p className="text-xs text-red-500 mt-0.5">
                            {itemErrors.channel_mapping_id.message}
                          </p>
                        )}
                      </td>

                      <td className="px-3 py-2">
                        <input
                          type="text"
                          {...register(`items.${index}.sales_manager`, {
                            required: '영업담당자를 입력하세요.',
                            maxLength: { value: 50, message: '50자 이하' },
                          })}
                          aria-required="true"
                          className={inputClass(!!itemErrors?.sales_manager)}
                          placeholder="영업담당자명"
                        />
                        {itemErrors?.sales_manager && (
                          <p className="text-xs text-red-500 mt-0.5">{itemErrors.sales_manager.message}</p>
                        )}
                      </td>

                      <td className="px-3 py-2">
                        <input
                          type="text"
                          {...register(`items.${index}.advertiser`, {
                            required: '광고주를 입력하세요.',
                            maxLength: { value: 100, message: '100자 이하' },
                          })}
                          aria-required="true"
                          className={inputClass(!!itemErrors?.advertiser)}
                          placeholder="광고주명"
                        />
                        {itemErrors?.advertiser && (
                          <p className="text-xs text-red-500 mt-0.5">{itemErrors.advertiser.message}</p>
                        )}
                      </td>

                      <td className="px-3 py-2 align-top">
                        <input
                          type="date"
                          {...register(`items.${index}.broadcast_date`, {
                            required: '방송일자를 입력하세요.',
                          })}
                          className={inputClass(!!itemErrors?.broadcast_date)}
                        />
                        {itemErrors?.broadcast_date && (
                          <p className="text-xs text-red-500 mt-0.5">{itemErrors.broadcast_date.message}</p>
                        )}
                      </td>

                      <td className="px-3 py-2">
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
                          className={`${inputClass(!!itemErrors?.req_time_start)} bg-white`}
                        >
                          <option value="">시간대 선택</option>
                          {TIME_RANGE_OPTIONS.map((option) => (
                            <option key={option.start} value={option.start}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {itemErrors?.req_time_start && (
                          <p className="text-xs text-red-500 mt-0.5">{itemErrors.req_time_start.message}</p>
                        )}
                        {midnightCross && (
                          <p className="text-xs text-blue-500 mt-0.5">자정 넘김 요청</p>
                        )}
                      </td>

                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="13:11"
                          maxLength={5}
                          {...register(`items.${index}.monitoring_time`, {
                            required: '송출 시간을 입력하세요.',
                            validate: (value) => !!normalizeTimeInput(value) || 'HH:MM (24시간)',
                          })}
                          aria-required="true"
                          className={`${inputClass(!!itemErrors?.monitoring_time)} ${
                            monitoringWarn ? 'border-yellow-400 focus:ring-yellow-400' : ''
                          }`}
                        />
                        {itemErrors?.monitoring_time && (
                          <p className="text-xs text-red-500 mt-0.5">{itemErrors.monitoring_time.message}</p>
                        )}
                        {monitoringWarn && (
                          <p className="text-xs text-yellow-600 mt-0.5">요청 시간대 밖입니다.</p>
                        )}
                      </td>

                      <td className="px-3 py-2">
                        <input
                          type="text"
                          {...register(`items.${index}.item_memo`, {
                            maxLength: { value: 200, message: '200자 이하' },
                          })}
                          className="border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                          placeholder="메모 (선택)"
                        />
                      </td>

                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleCopyRow(index)}
                            className="rounded border border-blue-200 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-50"
                          >
                            복사
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePasteRow(index)}
                            disabled={!copiedItem || fields.length >= MAX_ROWS}
                            className="rounded border border-green-200 px-2 py-1 text-[11px] text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            붙여넣기
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(index)}
                            disabled={fields.length <= 1}
                            className="rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
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
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            + 행 추가
          </button>
          {fields.length >= MAX_ROWS && (
            <span className="text-xs text-yellow-600">최대 {MAX_ROWS}행에 도달했습니다.</span>
          )}
          {channels.length === 0 && !channelLoading && (
            <span className="text-xs text-red-500">
              등록된 활성 채널이 없습니다. 관리자에게 문의하세요.
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
    </div>
  );
}
