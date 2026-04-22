/**
 * 통계 대시보드 페이지 (admin 전용)
 *
 * 기간 선택 모드:
 *   연별(yearly) — 연도 선택 → 해당 연도 전체 통계 + 월별 분석표
 *   월별(monthly) — 연+월 선택 → 해당 월 통계 + 일별 분석표
 *   일별(daily)   — 날짜 선택 → 해당 일 통계 (채널/광고주/영업담당자 breakdown)
 *
 * 데이터 흐름:
 *   기간 선택 변경 → from/to 계산 → 전체 stats 일괄 재조회
 *   (summary, by-channel, by-advertiser, by-sales-manager는 from/to로 필터)
 *   (monthly breakdown은 year만, daily breakdown은 year+month만 사용)
 */

import { useEffect, useState, useCallback } from 'react';
import { BarChart3 } from 'lucide-react';
import {
  getStatsSummary,
  getStatsMonthly,
  getStatsDaily,
  getStatsByChannel,
  getStatsByAdvertiser,
  getStatsBySalesManager,
  exportStatsCsv,
} from '../lib/apiService';
import type {
  StatsSummary,
  StatsMonthly,
  StatsDaily,
  StatsByChannel,
  StatsByAdvertiser,
  StatsBySalesManager,
} from '../types';
import { useToast } from '../components/ToastMessage';
import PageHeader from '../components/PageHeader';
import { getKstNowParts } from '../lib/datetime';
import ErrorBanner from '../components/ErrorBanner';

// ─── 상수 ────────────────────────────────────────────────────────────────────

// KST 기준 올해 연도/월/일
const kstNow = getKstNowParts();
const THIS_YEAR = kstNow.year;
const THIS_MONTH = kstNow.month;
const THIS_DATE = kstNow.date;

const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

// 선택 가능한 연도 목록 (올해 포함 최근 5년)
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => THIS_YEAR - i);

// ─── 기간 모드 타입 ───────────────────────────────────────────────────────────

type PeriodMode = 'yearly' | 'monthly' | 'daily';

/** 모드에 따라 from/to를 계산하는 헬퍼 */
function calcFromTo(
  mode: PeriodMode,
  year: number,
  month: number,
  date: string,
): { from: string; to: string } {
  if (mode === 'yearly') {
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  if (mode === 'monthly') {
    const lastDay = new Date(year, month, 0).getDate();   // 해당 월 마지막 날
    const mm = String(month).padStart(2, '0');
    return {
      from: `${year}-${mm}-01`,
      to:   `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
    };
  }
  // daily
  return { from: date, to: date };
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function StatsDashboardPage() {
  const { showToast } = useToast();

  // ─── 기간 선택 상태 ─────────────────────────────────────────────────────────
  const [mode, setMode]       = useState<PeriodMode>('yearly');
  const [year, setYear]       = useState(THIS_YEAR);
  const [month, setMonth]     = useState(THIS_MONTH);
  const [date, setDate]       = useState(THIS_DATE);

  // ─── 통계 데이터 상태 ───────────────────────────────────────────────────────
  const [summary, setSummary]               = useState<StatsSummary | null>(null);
  const [monthly, setMonthly]               = useState<StatsMonthly[]>([]);
  const [daily, setDaily]                   = useState<StatsDaily[]>([]);
  const [channels, setChannels]             = useState<StatsByChannel[]>([]);
  const [advertisers, setAdvertisers]       = useState<StatsByAdvertiser[]>([]);
  const [salesManagers, setSalesManagers]   = useState<StatsBySalesManager[]>([]);

  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');

  // ─── CSV 내보내기 상태 ──────────────────────────────────────────────────────
  const [csvFrom, setCsvFrom]       = useState('');
  const [csvTo, setCsvTo]           = useState('');
  const [csvLoading, setCsvLoading] = useState(false);

  // ─── 데이터 조회 함수 ───────────────────────────────────────────────────────

  /**
   * 현재 선택된 기간 기준으로 모든 stats 데이터를 일괄 재조회한다.
   * 모드에 따라:
   *   - yearly: monthly breakdown 포함
   *   - monthly: daily breakdown 포함
   *   - daily: breakdown 없이 채널/광고주/영업담당자만
   */
  const fetchAll = useCallback(async (
    currentMode: PeriodMode,
    currentYear: number,
    currentMonth: number,
    currentDate: string,
  ) => {
    const { from, to } = calcFromTo(currentMode, currentYear, currentMonth, currentDate);
    setLoading(true);
    setLoadError('');

    try {
      const commonPromises = [
        getStatsSummary(from, to),
        getStatsByChannel(from, to),
        getStatsByAdvertiser(20, from, to),
        getStatsBySalesManager(from, to),
      ] as const;

      if (currentMode === 'yearly') {
        const [s, c, a, sm, m] = await Promise.all([
          ...commonPromises,
          getStatsMonthly(currentYear),
        ]);
        setSummary(s);
        setChannels(c);
        setAdvertisers(a);
        setSalesManagers(sm);
        setMonthly(m);
        setDaily([]);
      } else if (currentMode === 'monthly') {
        const [s, c, a, sm, d] = await Promise.all([
          ...commonPromises,
          getStatsDaily(currentYear, currentMonth),
        ]);
        setSummary(s);
        setChannels(c);
        setAdvertisers(a);
        setSalesManagers(sm);
        setMonthly([]);
        setDaily(d);
      } else {
        const [s, c, a, sm] = await Promise.all(commonPromises);
        setSummary(s);
        setChannels(c);
        setAdvertisers(a);
        setSalesManagers(sm);
        setMonthly([]);
        setDaily([]);
      }
    } catch {
      setLoadError('통계 데이터를 불러오지 못했습니다.');
      showToast('통계 데이터를 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // ─── 초기 로딩 및 기간 변경 시 재조회 ──────────────────────────────────────
  useEffect(() => {
    fetchAll(mode, year, month, date);
  }, [fetchAll, mode, year, month, date]);

  // ─── CSV 내보내기 ───────────────────────────────────────────────────────────
  const handleExportCsv = async () => {
    if (!csvFrom || !csvTo) {
      showToast('시작일과 종료일을 모두 입력해주세요.', 'error');
      return;
    }
    if (csvFrom > csvTo) {
      showToast('시작일이 종료일보다 늦을 수 없습니다.', 'error');
      return;
    }
    setCsvLoading(true);
    try {
      await exportStatsCsv(csvFrom, csvTo);
      showToast('CSV 파일 다운로드가 시작되었습니다.', 'success');
    } catch {
      showToast('CSV 내보내기에 실패했습니다.', 'error');
    } finally {
      setCsvLoading(false);
    }
  };

  // ─── 기간 라벨 (제목 표시용) ─────────────────────────────────────────────
  const periodLabel =
    mode === 'yearly'  ? `${year}년` :
    mode === 'monthly' ? `${year}년 ${month}월` :
    date.replace(/-/g, '.');
  const modeLabel =
    mode === 'yearly' ? '연별 분석' :
    mode === 'monthly' ? '월별 분석' :
    '일별 분석';

  // ─── 로딩 상태 ──────────────────────────────────────────────────────────────
  if (loading && !summary) {
    return (
      <div className="app-page">
        <div className="app-surface px-6 py-5 text-center text-sm text-[var(--app-text-soft)]">
          통계 데이터를 불러오는 중...
        </div>
      </div>
    );
  }

  return (
    <div className="app-page space-y-6">
      <PageHeader
        title="통계 대시보드"
        subtitle="요청 항목 흐름을 기간별로 정리하고, 채널·광고주·영업담당자 기준으로 함께 비교할 수 있습니다."
        icon={BarChart3}
      />

      {loadError && <ErrorBanner message={loadError} onRetry={() => { void fetchAll(mode, year, month, date); }} />}

      {/* ── 기간 선택 패널 ───────────────────────────────────────────────────── */}
      <section className="app-surface p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div>
            <p className="app-eyebrow">Period</p>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--app-text)]">
              기준 기간 선택
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--app-text-soft)]">
              같은 데이터를 연도, 월, 일 단위로 바꿔보며 전체 흐름과 세부 패턴을 함께 확인할 수 있습니다.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {(['yearly', 'monthly', 'daily'] as PeriodMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`app-chip ${mode === m ? 'app-chip--active' : ''}`}
                >
                  {m === 'yearly' ? '연별' : m === 'monthly' ? '월별' : '일별'}
                </button>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-end gap-3">
              {mode === 'yearly' && (
                <div>
                  <label className="app-label">연도</label>
                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="app-select app-select--dense min-w-[120px]"
                  >
                    {YEAR_OPTIONS.map((y) => (
                      <option key={y} value={y}>{y}년</option>
                    ))}
                  </select>
                </div>
              )}

              {mode === 'monthly' && (
                <>
                  <div>
                    <label className="app-label">연도</label>
                    <select
                      value={year}
                      onChange={(e) => setYear(Number(e.target.value))}
                      className="app-select app-select--dense min-w-[120px]"
                    >
                      {YEAR_OPTIONS.map((y) => (
                        <option key={y} value={y}>{y}년</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="app-label">월</label>
                    <select
                      value={month}
                      onChange={(e) => setMonth(Number(e.target.value))}
                      className="app-select app-select--dense min-w-[120px]"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>{m}월</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {mode === 'daily' && (
                <div>
                  <label className="app-label">날짜</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="app-field app-field--dense min-w-[180px]"
                  />
                </div>
              )}

              {loading && (
                <span className="pb-2 text-xs text-[var(--app-text-faint)]">조회 중...</span>
              )}
            </div>
          </div>

          <div className="app-toolbar-card p-4">
            <p className="app-label mb-1">현재 기준</p>
            <p className="text-lg font-semibold text-[var(--app-text)]">{periodLabel}</p>
            <p className="mt-2 text-sm text-[var(--app-text-soft)]">{modeLabel}</p>
            <div className="app-divider my-4" />
            <p className="text-xs leading-6 text-[var(--app-text-faint)]">
              표와 요약 카드는 선택한 기간을 기준으로 즉시 다시 계산됩니다.
            </p>
          </div>
        </div>
      </section>

      {/* ── 요약 카드 ─────────────────────────────────────────────────────────── */}
      {summary && (
        <section className="app-surface p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="app-eyebrow">Overview</p>
              <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--app-text)]">
                {periodLabel} 요약
              </h2>
            </div>
            <p className="text-sm text-[var(--app-text-soft)]">
              현재 선택한 기간의 항목 수 기준 요약입니다.
            </p>
          </div>
          <div className="app-stat-grid">
            <SummaryCard label="전체 항목" value={summary.total} color="gray" />
            <SummaryCard label="완료" value={summary.done} color="green" />
            <SummaryCard label="진행 중" value={summary.in_progress} color="blue" />
            <SummaryCard label="반려" value={summary.rejected} color="red" />
          </div>
        </section>
      )}

      {/* ── 월별 분석 (연별 모드) ──────────────────────────────────────────────── */}
      {mode === 'yearly' && monthly.length > 0 && (
        <StatsSection
          eyebrow="Timeline"
          title={`${year}년 월별 요청 항목 건수`}
          description="연간 흐름을 한 줄로 비교할 수 있도록 월별 합계를 정리했습니다."
        >
          <div className="app-table-shell overflow-x-auto">
            <table className="app-table text-sm">
              <thead>
                <tr>
                  {MONTH_NAMES.map((m) => (
                    <th key={m} className="text-center">
                      {m}
                    </th>
                  ))}
                  <th className="text-center">합계</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {monthly.map((m, i) => (
                    <td key={i} className="text-center font-medium">
                      {m.count}
                    </td>
                  ))}
                  <td className="text-center font-semibold">
                    {monthly.reduce((s, m) => s + m.count, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </StatsSection>
      )}

      {/* ── 일별 분석 (월별 모드) ──────────────────────────────────────────────── */}
      {mode === 'monthly' && daily.length > 0 && (
        <StatsSection
          eyebrow="Timeline"
          title={`${year}년 ${month}월 일별 요청 항목 건수`}
          description="월간 흐름 안에서 날짜별 집중 구간을 바로 확인할 수 있습니다."
        >
          <div className="app-table-shell overflow-x-auto">
            <table className="app-table text-sm">
              <thead>
                <tr>
                  {daily.map((d) => (
                    <th key={d.day} className="min-w-[32px] text-center">
                      {Number(d.day)}일
                    </th>
                  ))}
                  <th className="text-center">합계</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {daily.map((d) => (
                    <td key={d.day} className="text-center font-medium">
                      {d.count}
                    </td>
                  ))}
                  <td className="text-center font-semibold">
                    {daily.reduce((s, d) => s + d.count, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </StatsSection>
      )}

      {/* ── 채널별 / 광고주별 ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* 채널별 */}
        <StatsSection
          eyebrow="Breakdown"
          title="채널별 요청 항목 건수"
          description="채널 단위로 요청량을 비교합니다."
        >
          {channels.length === 0 ? (
            <EmptyStatsBlock />
          ) : (
            <div className="app-table-shell overflow-hidden">
              <table className="app-table text-sm">
                <thead>
                  <tr>
                    <th>채널</th>
                    <th className="text-right">건수</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((c, i) => (
                    <tr key={i}>
                      <td>{c.channel_name}</td>
                      <td className="text-right font-medium">{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </StatsSection>

        {/* 광고주별 */}
        <StatsSection
          eyebrow="Breakdown"
          title="광고주별 요청 항목 건수"
          description="상위 20개 광고주 기준으로 요청량을 정리합니다."
        >
          {advertisers.length === 0 ? (
            <EmptyStatsBlock />
          ) : (
            <div className="app-table-shell overflow-hidden">
              <table className="app-table text-sm">
                <thead>
                  <tr>
                    <th>광고주</th>
                    <th className="text-right">건수</th>
                  </tr>
                </thead>
                <tbody>
                  {advertisers.map((a, i) => (
                    <tr key={i}>
                      <td>{a.advertiser}</td>
                      <td className="text-right font-medium">{a.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </StatsSection>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <StatsSection
          eyebrow="Breakdown"
          title="영업담당자별 요청 항목 건수"
          description="영업담당자별 요청량을 비교합니다."
        >
          {salesManagers.length === 0 ? (
            <EmptyStatsBlock />
          ) : (
            <div className="app-table-shell overflow-hidden">
              <table className="app-table w-full text-sm">
                <thead>
                  <tr>
                    <th>영업담당자</th>
                    <th className="text-right">건수</th>
                  </tr>
                </thead>
                <tbody>
                  {salesManagers.map((sm, i) => (
                    <tr key={i}>
                      <td>{sm.sales_manager}</td>
                      <td className="text-right font-medium">{sm.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </StatsSection>

        <StatsSection
          eyebrow="Export"
          title="CSV 내보내기"
          description="기간을 지정해 요청 항목 전체를 파일로 내보냅니다."
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="app-label">시작일</label>
                <input
                  type="date"
                  value={csvFrom}
                  onChange={(e) => setCsvFrom(e.target.value)}
                  className="app-field app-field--dense"
                />
              </div>
              <div>
                <label className="app-label">종료일</label>
                <input
                  type="date"
                  value={csvTo}
                  onChange={(e) => setCsvTo(e.target.value)}
                  className="app-field app-field--dense"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={csvLoading}
              className="app-btn app-btn--primary w-full sm:w-auto"
            >
              {csvLoading ? '내보내는 중...' : 'CSV 다운로드'}
            </button>
            <p className="text-xs leading-6 text-[var(--app-text-faint)]">
              선택한 기간의 요청 항목 전체를 CSV 파일로 내보냅니다. Excel에서 열면 한글이 올바르게 표시됩니다.
            </p>
          </div>
        </StatsSection>
      </div>
    </div>
  );
}

// ─── 요약 카드 컴포넌트 ────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  value: number;
  color: 'gray' | 'green' | 'blue' | 'red';
}

const COLOR_MAP = {
  gray:  'bg-[rgba(255,250,244,0.92)] text-[var(--app-text)]',
  green: 'bg-[rgba(242,249,244,0.96)] text-emerald-800',
  blue:  'bg-[rgba(241,247,255,0.96)] text-sky-800',
  red:   'bg-[rgba(255,244,244,0.96)] text-rose-800',
};

function SummaryCard({ label, value, color }: SummaryCardProps) {
  return (
    <div className={`app-stat-card ${COLOR_MAP[color]}`}>
      <p className="app-stat-card__label">{label}</p>
      <p className="app-stat-card__value">{value.toLocaleString()}</p>
    </div>
  );
}

function StatsSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="app-surface p-6">
      <div className="mb-4">
        <p className="app-eyebrow">{eyebrow}</p>
        <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--app-text)]">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--app-text-soft)]">{description}</p>
      </div>
      {children}
    </section>
  );
}

function EmptyStatsBlock() {
  return (
    <div className="rounded-[20px] border border-dashed border-[var(--app-border)] bg-[rgba(245,237,229,0.62)] px-4 py-8 text-center text-sm text-[var(--app-text-soft)]">
      데이터가 없습니다.
    </div>
  );
}
