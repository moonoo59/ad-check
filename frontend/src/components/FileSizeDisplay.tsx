/**
 * FileSizeDisplay 컴포넌트
 *
 * 파일 크기(bytes)를 사람이 읽기 쉬운 GB/MB 단위로 변환하여 표시한다.
 * 1GB 이상이면 GB, 미만이면 MB (소수점 1자리).
 *
 * 예: 4,294,967,296 → 4.0 GB
 */

interface FileSizeDisplayProps {
  bytes: number;
}

export default function FileSizeDisplay({ bytes }: FileSizeDisplayProps) {
  const GB = 1024 * 1024 * 1024;
  const MB = 1024 * 1024;

  const display =
    bytes >= GB
      ? `${(bytes / GB).toFixed(1)} GB`
      : `${(bytes / MB).toFixed(1)} MB`;

  return <span className="text-sm tabular-nums text-[var(--app-text)]">{display}</span>;
}
