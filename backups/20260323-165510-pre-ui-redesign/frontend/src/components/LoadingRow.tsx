/**
 * LoadingRow 컴포넌트
 *
 * 테이블 로딩 중 스켈레톤 행 표시.
 * colSpan으로 열 수를 맞춰주어야 한다.
 */

interface LoadingRowProps {
  colSpan: number;
  rows?: number; // 표시할 스켈레톤 행 수 (기본 5)
}

export default function LoadingRow({ colSpan, rows = 5 }: LoadingRowProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          <td colSpan={colSpan} className="px-4 py-3">
            <div className="h-4 bg-gray-200 rounded animate-pulse w-full" />
          </td>
        </tr>
      ))}
    </>
  );
}
