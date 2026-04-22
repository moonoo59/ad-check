/**
 * StatusBadge 컴포넌트
 *
 * 상태값(request_status, item_status, copy_job_status 등)을
 * 한글 레이블 + 색상 배지로 자동 변환하여 표시한다.
 *
 * shadcn/ui Badge 컴포넌트를 기반으로 구현.
 * 색상 팔레트는 UX 설계서 기준:
 * - success: 완료/성공/활성 (초록)
 * - destructive: 오류/실패/비활성 (빨간)
 * - warning: 경고/낮은 신뢰도 (노란)
 * - secondary: 중립/대기 (회색)
 * - info: 진행 중 (파란)
 */

import { Badge, type BadgeProps } from '@/components/ui/badge';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

interface StatusConfig {
  label: string;
  variant: BadgeVariant;
}

// 상태값 → 레이블/색상 매핑 테이블
const STATUS_MAP: Record<string, StatusConfig> = {
  // 요청/항목 상태
  pending:     { label: '대기 중',    variant: 'secondary' },
  searching:   { label: '탐색 중',    variant: 'info'      },
  search_done: { label: '탐색 완료',  variant: 'info'      },
  failed:      { label: '실패',       variant: 'destructive' },
  editing:     { label: '요청 수정중', variant: 'warning'  },
  approved:    { label: '승인됨',     variant: 'success'   },
  copying:     { label: '복사 중',    variant: 'info'      },
  done:        { label: '완료',       variant: 'success'   },
  rejected:    { label: '반려',       variant: 'destructive' },

  // copy_jobs 상태
  waiting: { label: '복사 대기', variant: 'secondary' },
  running: { label: '복사 중',   variant: 'info'      },

  // 채널 활성 여부
  active:   { label: '활성',   variant: 'success'   },
  inactive: { label: '비활성', variant: 'secondary' },

  // copy_jobs 완료 상태
  success: { label: '성공', variant: 'success' },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = STATUS_MAP[status] ?? { label: status, variant: 'outline' as BadgeVariant };

  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
