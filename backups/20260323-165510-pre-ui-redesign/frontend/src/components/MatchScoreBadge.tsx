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
    className = 'bg-green-100 text-green-800';
  } else if (score >= 60) {
    label = '보통';
    className = 'bg-yellow-100 text-yellow-800';
  } else {
    label = '낮음';
    className = 'bg-red-100 text-red-800';
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${className}`}>
      {score}
      <span className="text-xs opacity-70">({label})</span>
    </span>
  );
}
