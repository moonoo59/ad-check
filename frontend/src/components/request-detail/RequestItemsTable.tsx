import type { CopyJob, FileSearchResult, RequestItem } from '../../types';
import StatusBadge from '../StatusBadge';

type ItemWithResults = RequestItem & {
  file_search_results: FileSearchResult[];
  copy_job: CopyJob | null;
};

interface RequestItemsTableProps {
  items: ItemWithResults[];
  selectedItemIdx: number;
  onSelectItem: (index: number) => void;
}

export default function RequestItemsTable({
  items,
  selectedItemIdx,
  onSelectItem,
}: RequestItemsTableProps) {
  return (
    <section className="app-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--app-text)]">요청 항목</h2>
        <span className="text-xs text-[var(--app-text-faint)]">선택한 항목의 파일 탐색 결과가 아래에 표시됩니다.</span>
      </div>
      <div className="app-table-shell app-table-shell--flat">
        <table className="app-table app-table--compact app-table--fixed app-table--wrap text-sm">
          <thead>
            <tr>
              <th className="w-[64px]">#</th>
              <th className="w-[16%]">채널</th>
              <th className="w-[15%]">영업담당자</th>
              <th className="w-[16%]">광고주</th>
              <th className="w-[15%]">방송송출일자</th>
              <th className="w-[15%]">시간대</th>
              <th className="w-[120px]">상태</th>
              <th className="w-[52px]" />
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const hasSelected = item.file_search_results.some((file) => file.is_selected === 1);
              const isSelected = idx === selectedItemIdx;
              const isDeletedCopy = !!item.copy_job?.deleted_at;

              return (
                <tr
                  key={item.id}
                  className={`transition-colors ${
                    isSelected ? 'border-l-[3px] border-l-[var(--app-primary)] bg-[rgba(120,88,68,0.05)]' : ''
                  } ${item.item_status === 'failed' ? 'bg-[rgba(255,244,244,0.86)]' : ''}`}
                >
                  <td className="text-[var(--app-text-faint)]">
                    <button
                      type="button"
                      onClick={() => onSelectItem(idx)}
                      className={`inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border px-2 text-[11px] font-semibold ${
                        isSelected
                          ? 'border-[var(--app-primary)] bg-[rgba(120,88,68,0.12)] text-[var(--app-primary)]'
                          : 'border-[var(--app-border)] text-[var(--app-text-soft)] hover:border-[var(--app-primary)] hover:text-[var(--app-primary)]'
                      }`}
                      aria-pressed={isSelected}
                      aria-label={`${item.sort_order}번 항목 선택`}
                    >
                      {item.sort_order}
                    </button>
                  </td>
                  <td className="font-medium">{item.channel_display_name ?? item.channel_mapping_id}</td>
                  <td className="text-[var(--app-text-soft)]">{item.sales_manager}</td>
                  <td className="text-[var(--app-text-soft)]">{item.advertiser}</td>
                  <td className="whitespace-nowrap tabular-nums text-[var(--app-text-soft)]">{item.broadcast_date}</td>
                  <td className="whitespace-nowrap tabular-nums text-[var(--app-text-soft)]">
                    {item.req_time_start}~{item.req_time_end}
                  </td>
                  <td>
                    <StatusBadge status={item.item_status} />
                  </td>
                  <td className="text-center">
                    {isDeletedCopy ? (
                      <span className="text-[10px] text-[var(--app-text-faint)]">삭제</span>
                    ) : hasSelected ? (
                      <span className="text-sm text-emerald-600">✓</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
