/**
 * LoadingRow 컴포넌트
 *
 * 테이블 로딩 중 스켈레톤 행 표시.
 * 다양한 너비의 스켈레톤을 교차 배치하여 실제 콘텐츠처럼 보이게 개선.
 * colSpan으로 열 수를 맞춰주어야 한다.
 */

interface LoadingRowProps {
  colSpan: number;
  rows?: number; // 표시할 스켈레톤 행 수 (기본 5)
}

// 행마다 다른 너비 패턴을 적용하여 자연스러운 스켈레톤 표현
const WIDTH_PATTERNS = ['w-[85%]', 'w-[72%]', 'w-[91%]', 'w-[68%]', 'w-[78%]'];

export default function LoadingRow({ colSpan, rows = 5 }: LoadingRowProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-t border-[rgba(212,197,183,0.7)]">
          <td colSpan={colSpan} className="px-4 py-3.5">
            <div className="flex items-center gap-3">
              {/* 짧은 좌측 스켈레톤 (ID 등) */}
              <div className="h-3.5 w-12 animate-pulse rounded-full bg-[rgba(120,88,68,0.1)]" />
              {/* 긴 본문 스켈레톤 */}
              <div
                className={`h-3.5 ${WIDTH_PATTERNS[i % WIDTH_PATTERNS.length]} animate-pulse rounded-full bg-[rgba(120,88,68,0.1)]`}
                style={{ animationDelay: `${i * 80}ms` }}
              />
              {/* 우측 배지 자리 스켈레톤 */}
              <div
                className="ml-auto h-5 w-16 animate-pulse rounded-full bg-[rgba(120,88,68,0.08)]"
                style={{ animationDelay: `${i * 80 + 40}ms` }}
              />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}
