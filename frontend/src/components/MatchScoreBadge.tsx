/**
 * MatchScoreBadge 컴포넌트
 *
 * 파일 탐색 결과의 match_score를 시각화한다.
 * - 80 이상: green ("높음")
 * - 60~79: yellow ("보통")
 * - 60 미만: red ("낮음")
 */

interface MatchScoreBadgeProps {
  score: number;
}

export default function MatchScoreBadge({ score }: MatchScoreBadgeProps) {
  let label: string;
  let className: string;

  if (score >= 80) {
    label = '높음';
    className = 'border border-emerald-200 bg-emerald-50 text-emerald-800';
  } else if (score >= 60) {
    label = '보통';
    className = 'border border-amber-200 bg-amber-50 text-amber-800';
  } else {
    label = '낮음';
    className = 'border border-rose-200 bg-rose-50 text-rose-800';
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {score}
      <span className="text-xs opacity-70">({label})</span>
    </span>
  );
}
