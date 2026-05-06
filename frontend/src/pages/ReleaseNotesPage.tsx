import { FileText } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { RELEASE_NOTES } from '../lib/releaseNotes';

export default function ReleaseNotesPage() {
  return (
    <div className="app-page">
      <div className="mb-6">
        <PageHeader
          title="릴리즈 노트"
          subtitle="시스템의 새로운 기능 및 업데이트 내역을 안내해 드립니다."
          icon={FileText}
        />
      </div>

      <div className="space-y-8">
        {RELEASE_NOTES.map((note, idx) => (
          <section
            key={note.version}
            className={`app-surface p-6 ${idx === 0 ? 'border-2 border-[var(--app-primary)]' : ''}`}
          >
            <div className="mb-4 flex items-center justify-between border-b border-[var(--app-border)] pb-3">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-[var(--app-text)]">
                  v{note.version}
                </h2>
                {idx === 0 && (
                  <span className="rounded-full bg-[rgba(120,88,68,0.12)] px-2.5 py-1 text-[11px] font-semibold text-[var(--app-primary)]">
                    최신 버전
                  </span>
                )}
              </div>
              <time className="text-sm text-[var(--app-text-soft)]">{note.date}</time>
            </div>

            <div className="space-y-5">
              {note.features.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-emerald-700">✨ 새로운 기능 & 개선</h3>
                  <ul className="list-inside list-disc space-y-1.5 text-sm text-[var(--app-text-soft)]">
                    {note.features.map((feature, i) => (
                      <li key={i}>{feature}</li>
                    ))}
                  </ul>
                </div>
              )}

              {note.fixes.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-amber-700">🐛 버그 수정</h3>
                  <ul className="list-inside list-disc space-y-1.5 text-sm text-[var(--app-text-soft)]">
                    {note.fixes.map((fix, i) => (
                      <li key={i}>{fix}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
