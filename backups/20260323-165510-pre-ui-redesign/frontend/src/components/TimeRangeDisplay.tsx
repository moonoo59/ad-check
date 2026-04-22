/**
 * TimeRangeDisplay 컴포넌트
 *
 * HH:MM ~ HH:MM 형식의 시간대를 표시한다.
 * 시작과 종료 시간을 받아 "HH:MM ~ HH:MM" 형식으로 렌더링.
 */

interface TimeRangeDisplayProps {
  start: string; // HH:MM
  end: string;   // HH:MM
}

export default function TimeRangeDisplay({ start, end }: TimeRangeDisplayProps) {
  return (
    <span className="text-sm text-gray-700 tabular-nums whitespace-nowrap">
      {start} ~ {end}
    </span>
  );
}
