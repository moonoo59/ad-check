import type { CopyJob, FileSearchResult, RequestItem } from '../../types';

type ItemWithResults = RequestItem & {
  file_search_results: FileSearchResult[];
  copy_job: CopyJob | null;
};

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export default function CopyProgressRow({ item }: { item: ItemWithResults }) {
  const job = item.copy_job;
  if (!job) return null;

  const percent =
    job.total_bytes && job.total_bytes > 0
      ? Math.min(100, Math.round((job.progress_bytes / job.total_bytes) * 100))
      : null;

  const isDone = job.status === 'done';
  const isFailed = job.status === 'failed';
  const srcFileName = job.source_path.split('/').pop() ?? job.source_path;
  const destDir = job.dest_path.split('/').slice(0, -1).join('/');

  return (
    <div className={`rounded-[22px] border px-4 py-3 text-xs shadow-[0_10px_24px_rgba(83,58,37,0.05)] ${
      isDone ? 'border-emerald-200 bg-[rgba(242,249,244,0.96)]' :
      isFailed ? 'border-rose-200 bg-[rgba(255,244,244,0.96)]' :
      'border-[var(--app-border)] bg-[rgba(255,250,244,0.94)]'
    }`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-[var(--app-text)]">
          {item.channel_display_name} / {item.advertiser}
        </span>
        <span className={`font-semibold tabular-nums ${
          isDone ? 'text-emerald-700' :
          isFailed ? 'text-rose-700' :
          'text-sky-700'
        }`}>
          {isDone ? '완료' : isFailed ? '실패' : percent !== null ? `${percent}%` : '복사 중…'}
        </span>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2 text-[var(--app-text-soft)]">
        <div>
          <span className="mr-1 text-[var(--app-text-faint)]">소스:</span>
          <span className="font-mono" title={job.source_path}>{srcFileName}</span>
        </div>
        <div>
          <span className="mr-1 text-[var(--app-text-faint)]">목적지:</span>
          <span className="font-mono" title={job.dest_path}>{destDir}/</span>
        </div>
      </div>

      {!isFailed && (
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(120,88,68,0.12)]">
            {percent !== null ? (
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  isDone ? 'bg-emerald-500' : 'bg-sky-500'
                }`}
                style={{ width: `${percent}%` }}
              />
            ) : (
              <div className="h-2 w-1/3 animate-pulse rounded-full bg-sky-400" />
            )}
          </div>
          {job.total_bytes && (
            <div className="mt-1 text-right text-[var(--app-text-faint)] tabular-nums">
              {fmtBytes(job.progress_bytes)} / {fmtBytes(job.total_bytes)}
            </div>
          )}
        </div>
      )}

      {isFailed && job.error_message && (
        <div className="mt-1 text-rose-700">{job.error_message}</div>
      )}
    </div>
  );
}
