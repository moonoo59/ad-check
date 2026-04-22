/**
 * StatusBadge 컴포넌트
 *
 * 상태값(request_status, item_status, copy_job_status 등)을
 * 한글 레이블 + 색상 배지로 자동 변환하여 표시한다.
 *
 * 색상 팔레트는 UX 설계서 기준:
 * - green: 완료/성공/활성
 * - red: 오류/실패/비활성
 * - yellow: 경고/낮은 신뢰도
 * - gray: 중립/대기
 * - blue: 진행 중
 */

type BadgeVariant = 'green' | 'red' | 'yellow' | 'gray' | 'blue';

interface StatusConfig {
  label: string;
  variant: BadgeVariant;
}

// 상태값 → 레이블/색상 매핑 테이블
const STATUS_MAP: Record<string, StatusConfig> = {
  // 요청/항목 상태
  pending:     { label: '대기 중',   variant: 'gray' },
  searching:   { label: '탐색 중',   variant: 'blue' },
  search_done: { label: '탐색 완료', variant: 'blue' },
  failed:      { label: '실패',      variant: 'red' },
  editing:     { label: '요청 수정중', variant: 'yellow' },
  approved:    { label: '승인됨',    variant: 'green' },
  copying:     { label: '복사 중',   variant: 'blue' },
  done:        { label: '완료',      variant: 'green' },
  rejected:    { label: '반려',      variant: 'red' },

  // copy_jobs 상태
  waiting: { label: '복사 대기', variant: 'gray' },
  running: { label: '복사 중',   variant: 'blue' },

  // 채널 활성 여부
  active:   { label: '활성',   variant: 'green' },
  inactive: { label: '비활성', variant: 'gray' },

  // copy_jobs 완료 상태
  success: { label: '성공', variant: 'green' },
};

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  green:  'bg-green-100 text-green-800',
  red:    'bg-red-100 text-red-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  gray:   'bg-gray-100 text-gray-600',
  blue:   'bg-blue-100 text-blue-800',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = STATUS_MAP[status] ?? { label: status, variant: 'gray' as BadgeVariant };
  const variantClass = VARIANT_CLASSES[config.variant];

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variantClass} ${className}`}
    >
      {config.label}
    </span>
  );
}
