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

// ─── 상수 ────────────────────────────────────────────────────────────────────

// KST 기준 올해 연도/월/일
const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
const THIS_YEAR  = kstNow.getUTCFullYear();
const THIS_MONTH = kstNow.getUTCMonth() + 1;   // 1~12
const THIS_DATE  = kstNow.toISOString().slice(0, 10);   // YYYY-MM-DD

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
  const fetchAll = useCallback(
    async (
      currentMode: PeriodMode,
      currentYear: number,
      currentMonth: number,
      currentDate: string,
    ) => {
      const { from, to } = calcFromTo(currentMode, currentYear, currentMonth, currentDate);
      setLoading(true);

      try {
        // 공통: 요약 + 채널별 + 광고주별 + 영업담당자별 (모든 모드 공통)
        const commonPromises = [
          getStatsSummary(from, to),
          getStatsByChannel(from, to),
          getStatsByAdvertiser(20, from, to),
          getStatsBySalesManager(from, to),
        ] as const;

        if (currentMode === 'yearly') {
          // 연별: 월별 분석 추가
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
          // 월별: 일별 분석 추가
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
          // 일별: breakdown 없음
          const [s, c, a, sm] = await Promise.all(commonPromises);
          setSummary(s);
          setChannels(c);
          setAdvertisers(a);
          setSalesManagers(sm);
          setMonthly([]);
          setDaily([]);
        }
      } catch {
        showToast('통계 데이터를 불러오지 못했습니다.', 'error');
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ─── 초기 로딩 및 기간 변경 시 재조회 ──────────────────────────────────────
  useEffect(() => {
    fetchAll(mode, year, month, date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, year, month, date]);

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

  // ─── 로딩 상태 ──────────────────────────────────────────────────────────────
  if (loading && !summary) {
    return (
      <div className="max-w-screen-xl mx-auto px-6 py-10 text-center text-sm text-gray-400">
        통계 데이터를 불러오는 중...
      </div>
    );
  }

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-8">

      {/* ── 페이지 제목 ──────────────────────────────────────────────────────── */}
      <h1 className="text-lg font-semibold text-gray-900">통계 대시보드</h1>

      {/* ── 기간 선택 패널 ───────────────────────────────────────────────────── */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        {/* 모드 탭 */}
        <div className="flex gap-1 mb-4">
          {(['yearly', 'monthly', 'daily'] as PeriodMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                mode === m
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {m === 'yearly' ? '연별' : m === 'monthly' ? '월별' : '일별'}
            </button>
          ))}
        </div>

        {/* 기간 선택 컨트롤 */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* 연별: 연도만 선택 */}
          {mode === 'yearly' && (
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          )}

          {/* 월별: 연도 + 월 선택 */}
          {mode === 'monthly' && (
            <>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="text-sm border border-gray-300 rounded px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="text-sm border border-gray-300 rounded px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{m}월</option>
                ))}
              </select>
            </>
          )}

          {/* 일별: 날짜 picker */}
          {mode === 'daily' && (
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-sm border border-gray-300 rounded px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          )}

          {loading && (
            <span className="text-xs text-gray-400">조회 중...</span>
          )}
        </div>
      </div>

      {/* ── 요약 카드 ─────────────────────────────────────────────────────────── */}
      {summary && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            {periodLabel} 요약
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="전체 항목" value={summary.total} color="gray" />
            <SummaryCard label="완료" value={summary.done} color="green" />
            <SummaryCard label="진행 중" value={summary.in_progress} color="blue" />
            <SummaryCard label="반려" value={summary.rejected} color="red" />
          </div>
          {/* 기간 필터 없을 때(전체 통계 조회) 이번 달 카드 추가 — 현재는 항상 기간 필터 적용이므로 미표시 */}
        </section>
      )}

      {/* ── 월별 분석 (연별 모드) ──────────────────────────────────────────────── */}
      {mode === 'yearly' && monthly.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            {year}년 월별 요청 항목 건수
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {MONTH_NAMES.map((m) => (
                    <th key={m} className="border border-gray-200 px-3 py-2 text-center text-xs font-medium text-gray-600">
                      {m}
                    </th>
                  ))}
                  <th className="border border-gray-200 px-3 py-2 text-center text-xs font-medium text-gray-600">합계</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {monthly.map((m, i) => (
                    <td key={i} className="border border-gray-200 px-3 py-2 text-center text-gray-700 font-medium">
                      {m.count}
                    </td>
                  ))}
                  <td className="border border-gray-200 px-3 py-2 text-center text-gray-900 font-semibold">
                    {monthly.reduce((s, m) => s + m.count, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── 일별 분석 (월별 모드) ──────────────────────────────────────────────── */}
      {mode === 'monthly' && daily.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            {year}년 {month}월 일별 요청 항목 건수
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {daily.map((d) => (
                    <th key={d.day} className="border border-gray-200 px-2 py-2 text-center text-xs font-medium text-gray-600 min-w-[32px]">
                      {Number(d.day)}일
                    </th>
                  ))}
                  <th className="border border-gray-200 px-3 py-2 text-center text-xs font-medium text-gray-600">합계</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {daily.map((d) => (
                    <td key={d.day} className="border border-gray-200 px-2 py-2 text-center text-gray-700 font-medium">
                      {d.count}
                    </td>
                  ))}
                  <td className="border border-gray-200 px-3 py-2 text-center text-gray-900 font-semibold">
                    {daily.reduce((s, d) => s + d.count, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── 채널별 / 광고주별 ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 채널별 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">채널별 요청 항목 건수</h2>
          {channels.length === 0 ? (
            <p className="text-sm text-gray-400">데이터가 없습니다.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-600">채널</th>
                  <th className="border border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-600">건수</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="border border-gray-200 px-3 py-2 text-gray-700">{c.channel_name}</td>
                    <td className="border border-gray-200 px-3 py-2 text-right text-gray-700 font-medium">{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* 광고주별 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">광고주별 요청 항목 건수 (상위 20개)</h2>
          {advertisers.length === 0 ? (
            <p className="text-sm text-gray-400">데이터가 없습니다.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-600">광고주</th>
                  <th className="border border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-600">건수</th>
                </tr>
              </thead>
              <tbody>
                {advertisers.map((a, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="border border-gray-200 px-3 py-2 text-gray-700">{a.advertiser}</td>
                    <td className="border border-gray-200 px-3 py-2 text-right text-gray-700 font-medium">{a.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* ── 영업담당자별 ────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">영업담당자별 요청 항목 건수</h2>
        {salesManagers.length === 0 ? (
          <p className="text-sm text-gray-400">데이터가 없습니다.</p>
        ) : (
          <table className="w-full text-sm border-collapse max-w-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-600">영업담당자</th>
                <th className="border border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-600">건수</th>
              </tr>
            </thead>
            <tbody>
              {salesManagers.map((sm, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="border border-gray-200 px-3 py-2 text-gray-700">{sm.sales_manager}</td>
                  <td className="border border-gray-200 px-3 py-2 text-right text-gray-700 font-medium">{sm.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── CSV 내보내기 ──────────────────────────────────────────────────────── */}
      <section className="border-t border-gray-200 pt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">CSV 내보내기</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm text-gray-600">시작일</label>
          <input
            type="date"
            value={csvFrom}
            onChange={(e) => setCsvFrom(e.target.value)}
            className="text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-400">~</span>
          <label className="text-sm text-gray-600">종료일</label>
          <input
            type="date"
            value={csvTo}
            onChange={(e) => setCsvTo(e.target.value)}
            className="text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={csvLoading}
            className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {csvLoading ? '내보내는 중...' : 'CSV 다운로드'}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          * 선택한 기간의 요청 항목 전체를 CSV 파일로 내보냅니다. Excel에서 열면 한글이 올바르게 표시됩니다.
        </p>
      </section>
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
  gray:  'bg-gray-50 border-gray-200 text-gray-900',
  green: 'bg-green-50 border-green-200 text-green-700',
  blue:  'bg-blue-50 border-blue-200 text-blue-700',
  red:   'bg-red-50 border-red-200 text-red-700',
};

function SummaryCard({ label, value, color }: SummaryCardProps) {
  return (
    <div className={`rounded-lg border p-4 ${COLOR_MAP[color]}`}>
      <p className="text-xs font-medium mb-1 opacity-70">{label}</p>
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}
