/**
 * 매뉴얼 페이지
 *
 * 역할에 따라 다른 매뉴얼을 표시한다.
 * - admin    → 관리자 매뉴얼 (설치/시작/운용/유지보수/사용방법 전체)
 * - 그 외    → 사용자 매뉴얼 (접속/사용방법 전체 — 모든 기능 표시)
 */

import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import { getHealthInfo } from '../lib/apiService';

interface ManualUrls {
  publicBaseUrl: string;
  localBaseUrl: string;
}

// ============================================================
// 공통 레이아웃 컴포넌트
// ============================================================

/** 섹션 제목 */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-10 mb-3 border-b border-[var(--app-border)] pb-3 text-xl font-bold tracking-[-0.03em] text-[var(--app-text)] first:mt-0">
      {children}
    </h2>
  );
}

/** 소제목 */
function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 mb-2 text-base font-semibold text-[var(--app-text)]">
      {children}
    </h3>
  );
}

/** 코드 블록 */
function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="my-3 overflow-x-auto rounded-[20px] border border-[rgba(112,88,68,0.22)] bg-[rgba(48,37,29,0.96)] p-4 font-mono text-sm leading-relaxed text-[rgba(235,227,216,0.92)] whitespace-pre-wrap shadow-[0_16px_36px_rgba(31,22,17,0.12)]">
      {children}
    </pre>
  );
}

/** 안내 박스 */
function InfoBox({
  type,
  children,
}: {
  type: 'info' | 'warning' | 'tip' | 'danger';
  children: React.ReactNode;
}) {
  const styles = {
    info:    'bg-[rgba(244,247,252,0.96)] border-sky-200 text-sky-950',
    warning: 'bg-[rgba(255,248,236,0.96)] border-amber-300 text-amber-950',
    tip:     'bg-[rgba(242,249,244,0.96)] border-emerald-300 text-emerald-950',
    danger:  'bg-[rgba(255,244,244,0.96)] border-rose-300 text-rose-950',
  };
  const labels = { info: '안내', warning: '주의', tip: '팁', danger: '경고' };

  return (
    <div className={`my-3 rounded-[18px] border px-4 py-3 text-sm leading-6 shadow-[0_8px_20px_rgba(83,58,37,0.04)] ${styles[type]}`}>
      <span className="mr-2 inline-flex rounded-full border border-current/10 bg-white/60 px-2 py-0.5 text-[11px] font-bold">{labels[type]}</span>
      {children}
    </div>
  );
}

/** 테이블 */
function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | React.ReactNode)[][];
}) {
  return (
    <div className="app-table-shell my-3 overflow-x-auto">
      <table className="app-table text-sm">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className="align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 단계 항목 */
function Step({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="my-4 flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--app-primary)] text-xs font-bold text-white shadow-[0_8px_14px_rgba(120,88,68,0.16)]">
        {num}
      </div>
      <div className="flex-1">
        <p className="mb-1 text-sm font-semibold text-[var(--app-text)]">{title}</p>
        <div className="text-sm leading-7 text-[var(--app-text-soft)]">{children}</div>
      </div>
    </div>
  );
}

// ============================================================
// 상태값 공통 테이블 (사용자/관리자 공용)
// ============================================================

function StatusTable() {
  return (
    <Table
      headers={['상태', '의미', '다음 단계']}
      rows={[
        ['대기 중', '요청이 등록되었고 자동 탐색 시작 전이거나 준비 중인 상태.', '자동으로 탐색이 시작되거나 전송 담당자가 확인'],
        ['탐색 중', 'Logger Storage를 스캔하며 후보 파일을 찾는 중.', '5초마다 자동 갱신'],
        ['탐색 완료', '후보 파일이 준비되었고 전송 담당자가 파일을 선택할 수 있는 상태.', '파일 선택 후 승인 또는 반려'],
        ['승인됨', '복사 실행 직전 상태. 재전송 요청 후에도 이 상태로 돌아올 수 있음.', '전송 담당자가 복사 실행'],
        ['복사 중', '선택된 파일을 서버 로컬 스토리지로 복사하는 중.', '10초마다 자동 갱신'],
        ['완료', '파일 복사까지 모두 완료된 상태. [다운로드] 버튼으로 파일을 받을 수 있으며, 파일은 완료 후 1일이 지나면 자동 삭제됩니다.', '다운로드, 재전송 요청, 파일 삭제, 오전송 수정'],
        ['요청 수정중', '완료 요청의 일부 항목을 수정해 다시 탐색/복사하는 중.', '수정 항목 파일 선택 후 복사 실행'],
        ['반려', '전송 담당자 또는 관리자가 반려 처리한 상태.', '반려 사유 확인 후 새 요청 등록'],
        ['실패', '파일 탐색 또는 복사 단계에서 오류가 발생한 상태.', '탐색 재시도 또는 복사 재시도'],
      ]}
    />
  );
}

// ============================================================
// 사용자 매뉴얼 (모든 비관리자 사용자)
// ============================================================

function UserManual({
  role,
  canCopy,
  canViewStats,
  urls,
}: {
  role: string;
  canCopy: boolean;
  canViewStats: boolean;
  urls: ManualUrls;
}) {
  return (
    <>
      {/* ===== 1. 접속 방법 ===== */}
      <SectionTitle>1. 접속 방법</SectionTitle>

      <p className="text-sm text-gray-700 mb-3">
        관리자가 서비스를 실행한 뒤 아래 주소로 접속합니다. 별도 설치 불필요.
      </p>

      <Table
        headers={['구분', 'URL']}
        rows={[
          ['내부망 사용자 공용 주소', urls.publicBaseUrl],
          ['서비스 PC에서 직접 접속', urls.localBaseUrl],
        ]}
      />

      <SubTitle>초기 로그인</SubTitle>
      <p className="text-sm text-gray-700 mb-2">
        계정은 관리자가 생성합니다. 최초 로그인 후 반드시 비밀번호를 변경하세요.
      </p>
    <InfoBox type="warning">
        초기 비밀번호는 관리자에게 문의하세요. 로그인 화면의 <strong>[비밀번호 초기화]</strong> 링크를 통해 언제든지 현재 비밀번호 없이도 초기화가 가능합니다.
    </InfoBox>

      <SubTitle>로그인 후 기본 화면</SubTitle>
      <p className="text-sm text-gray-700">
        로그인 후 <strong>요청 등록</strong> 화면으로 이동합니다. 상단 메뉴에서 다른 기능으로 이동할 수 있습니다.
      </p>

      {/* ===== 2. 메뉴 구성 ===== */}
      <SectionTitle>2. 메뉴 구성</SectionTitle>
      <Table
        headers={['메뉴', '설명', '접근 조건']}
        rows={[
          ['요청 등록', '광고 증빙 파일 요청을 등록합니다.', '모든 사용자'],
          ['요청 목록', '등록된 요청의 상태를 조회합니다.', '모든 사용자'],
          ['매뉴얼', '사용 가이드를 확인합니다.', '모든 사용자'],
          ['통계', '요청 건수 통계 및 CSV 내보내기.', '모든 사용자'],
          ['관리자 메뉴', '채널 매핑, 감사 로그 관리.', '관리자 전용'],
        ]}
      />
      <InfoBox type="info">
        현재 시스템은 <strong>서버 관리자(admin)</strong>와 <strong>광고팀(ad_team)</strong> 두 개의 공용 계정으로 운영됩니다.
      </InfoBox>

      {/* ===== 3. 광고팀 사용 방법 ===== */}
      {(role === 'ad_team' || role === 'admin') && (
        <>
          <SectionTitle>3. 요청 등록 방법</SectionTitle>

          <Step num={1} title="요청 등록 화면으로 이동">
            상단 메뉴의 <strong>[요청 등록]</strong>을 클릭합니다. (로그인 후 기본 화면)
          </Step>

          <Step num={2} title="요청 정보 입력">
            <p className="mb-2">
              비고(선택)를 입력하고, <strong>[+ 행 추가]</strong> 버튼으로 행을 늘리거나 각 행 오른쪽의 <strong>[복사]</strong>, <strong>[붙여넣기]</strong> 버튼으로 같은 내용을 바로 아래에 추가할 수 있습니다.
            </p>
            <Table
              headers={['항목', '설명', '예시']}
              rows={[
                ['채널',       '드롭다운 선택 (등록된 채널만 표시)',      'ETV, ESPN, CNBC…'],
                ['광고주',     '텍스트 자유 입력',                       '삼성전자'],
                ['영업 담당자','텍스트 자유 입력',                       '홍길동'],
                ['방송 일자',  '직접 입력 또는 달력 선택',                '2026-03-10'],
                ['시작 시각',  'HH:MM 형식',                            '14:00'],
                ['종료 시각',  'HH:MM 형식',                            '15:00'],
                ['모니터링 시각', '선택 입력. 광고 방영을 확인한 시각', '14:32'],
              ]}
            />
            <InfoBox type="tip">
              모니터링 시각을 입력하면 파일 탐색 정확도가 높아집니다. 가능하면 입력하세요.
            </InfoBox>
            <InfoBox type="info">
              같은 형식의 요청이 반복되면 먼저 한 행을 입력한 뒤 <strong>[복사]</strong> 후 원하는 위치에서 <strong>[붙여넣기]</strong>를 눌러 바로 아래 행에 복제하세요.
            </InfoBox>
          </Step>

          <Step num={3} title="요청 제출">
            <strong>[요청 제출]</strong> 버튼을 클릭합니다. 요청 목록에서 상태를 확인할 수 있습니다.
          </Step>

          <Step num={4} title="결과 확인">
            <strong>[요청 목록]</strong>에서 요청을 클릭하면 상세 화면에서 파일 탐색 결과와 복사 진행 상황을 확인할 수 있습니다.
          </Step>

          <SubTitle>재전송 요청</SubTitle>
          <p className="text-sm text-gray-700 mb-2">
            완료(done) 상태 요청의 파일을 다시 복사해야 하는 경우, 요청 상세 화면의 <strong>[재전송 요청]</strong> 버튼을 클릭하고 사유를 입력합니다.
            기존 복사 파일은 유지되며, 동일한 경로로 재복사가 실행됩니다.
          </p>
        </>
      )}

      {/* ===== 4. 파일 전송 기능 (can_copy 권한 보유자) ===== */}
      {canCopy && (
        <>
          <SectionTitle>4. 파일 전송 (탐색/선택/복사)</SectionTitle>

          <InfoBox type="info">
            이 섹션은 <strong>파일 전송 권한</strong>이 부여된 사용자에게만 표시됩니다.
            권한이 없으면 관리자에게 요청하세요.
          </InfoBox>

          <InfoBox type="warning">
            파일 탐색을 시작하기 전 Logger Storage(녹화 서버)가 마운트되어 있어야 합니다.
            마운트가 안 되어 있으면 관리자에게 요청하세요.
          </InfoBox>

          <Step num={1} title="접수된 요청 확인">
            <strong>[요청 목록]</strong>에서 <strong>대기 중</strong> 또는 <strong>탐색 완료</strong> 상태의 요청을 클릭합니다.
          </Step>

          <Step num={2} title="파일 탐색 시작">
            요청 상세 화면에서 <strong>[파일 탐색 시작]</strong> 버튼을 클릭합니다.
            백그라운드에서 Logger Storage를 자동 스캔합니다. 화면은 5초마다 자동 갱신됩니다.
          </Step>

          <Step num={3} title="파일 선택">
            <p className="mb-2">탐색 완료 후 각 요청 항목별로 후보 파일 목록이 표시됩니다. 점수가 낮은 파일도 검토할 수 있으므로 매칭 근거를 함께 확인하세요.</p>
            <Table
              headers={['매칭 점수', '의미', '처리']}
              rows={[
                ['100%', '모니터링 시각이 포함된 파일 (가장 정확)', '우선 검토 후 선택'],
                ['100% 미만', '시간/구간 일부가 덜 일치하는 후보', '근거 확인 후 예외 선택 가능'],
              ]}
            />
            라디오 버튼으로 파일을 선택하면 자동 저장됩니다. (별도 저장 버튼 없음)
          </Step>

          <Step num={4} title="승인 또는 반려">
            <p>모든 항목에 파일이 선택되면 <strong>[승인 및 복사 실행]</strong> 버튼이 활성화됩니다.</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>승인</strong>: 선택된 파일을 서버 로컬 스토리지로 자동 복사합니다. 복사 진행률이 실시간으로 표시됩니다. 완료 후 [다운로드] 버튼으로 파일을 받을 수 있으며, 파일은 <strong>완료 후 1일이 지나면 자동 삭제</strong>됩니다.</li>
              <li><strong>반려</strong>: 사유를 입력하고 반려 처리합니다. 요청자가 재요청할 수 있습니다.</li>
            </ul>
          </Step>

          <SubTitle>오류 처리</SubTitle>
          <Table
            headers={['상황', '처리 방법']}
            rows={[
              ['탐색 실패 (Logger Storage 미마운트)', '관리자에게 마운트 요청 후 [탐색 재시도] 클릭'],
              ['복사 실패',                          '요청 상세에서 [복사 재시도] 클릭. 부분 복사된 파일은 자동 정리됩니다.'],
              ['파일이 탐색되지 않음',                '방송 날짜·채널 확인 후 [탐색 재시도] 클릭'],
            ]}
          />

          <SubTitle>완료 후 다운로드 / 파일 삭제 / 오전송 수정</SubTitle>
          <Table
            headers={['기능', '설명']}
            rows={[
              ['다운로드', '완료 항목 옆 [다운로드] 버튼을 클릭하면 브라우저에서 직접 파일을 받을 수 있습니다. 완료 후 1일이 지나면 파일이 자동 삭제되므로 이전에 다운로드하세요.'],
              ['파일 삭제', '완료 항목의 서버 로컬 복사본을 수동으로 삭제합니다. 요청/항목 기록은 유지됩니다.'],
              ['오전송 수정', '채널/방송일자/시간대/송출 시간을 수정하면 해당 항목만 다시 탐색되고 요청 상태가 "요청 수정중"으로 바뀝니다.'],
            ]}
          />
        </>
      )}

      {/* ===== 5. 통계 (can_view_stats 권한 보유자) ===== */}
      {canViewStats && (
        <>
          <SectionTitle>{canCopy ? '5' : '4'}. 통계 대시보드</SectionTitle>
          <p className="text-sm text-gray-700 mb-2">
            상단 메뉴의 <strong>[통계]</strong>를 클릭하면 요청 현황을 다양한 기준으로 분석할 수 있습니다.
          </p>
          <Table
            headers={['기능', '설명']}
            rows={[
              ['요약 카드', '전체/완료/반려/진행 중 요청 수를 한눈에 확인'],
              ['월별/일별 그래프', '연도·월별 요청 추이를 시각적으로 파악'],
              ['채널별 분석', '채널별 요청 비중 확인'],
              ['광고주별/영업담당자별 분석', '상위 광고주 및 담당자별 건수 확인'],
              ['CSV 내보내기', '기간을 지정해 전체 데이터를 CSV 파일로 다운로드'],
            ]}
          />
        </>
      )}

      {/* ===== 요청 상태 설명 ===== */}
      <SectionTitle>{canCopy && canViewStats ? '6' : canCopy || canViewStats ? '5' : '4'}. 요청 상태 설명</SectionTitle>
      <StatusTable />

      {/* ===== 자주 묻는 질문 ===== */}
      <SectionTitle>{canCopy && canViewStats ? '7' : canCopy || canViewStats ? '6' : '5'}. 자주 묻는 질문</SectionTitle>
      <Table
        headers={['질문', '답변']}
        rows={[
          ['서버 재시작 후 로그아웃됐어요.', '정상입니다. 세션은 서버 재시작 시 초기화됩니다. 재로그인하세요.'],
          ['파일 탐색은 얼마나 걸리나요?', '채널당 수백 개 파일을 스캔하며, 보통 수 초~수십 초 내에 완료됩니다.'],
          ['완료된 요청을 다시 복사해야 해요.', '요청 상세 → [재전송 요청] 버튼을 클릭하고 사유를 입력하세요.'],
          ['완료 파일을 어디서 받나요?', '요청 상세 화면에서 완료된 항목 옆 [다운로드] 버튼을 클릭하세요. 완료 후 1일이 지나면 파일이 자동 삭제됩니다.'],
          ['완료된 파일만 지우고 싶어요.', '파일 전송 권한이 있는 사용자는 요청 상세의 완료 항목에서 [파일 삭제]를 사용할 수 있습니다.'],
          ['비밀번호를 변경했는데 로그아웃됐어요.', '정상입니다. 비밀번호 변경 시 보안을 위해 기존 세션이 종료됩니다. 새 비밀번호로 다시 로그인하세요.'],
          ['채널이 드롭다운에 없어요.', '관리자에게 채널 매핑 등록을 요청하세요.'],
          ['비밀번호를 잊어버렸어요.', '로그인 화면 하단의 [비밀번호 초기화] 버튼을 클릭하세요. 현재 비밀번호를 모르더라도 계정 선택 후 새 비밀번호를 설정할 수 있습니다.'],
          ['통계 메뉴가 보이지 않아요.', '로그인 여부를 확인하세요. 현재 모든 로그인 사용자에게 통계 메뉴가 공개되어 있습니다.'],
          ['파일 탐색/승인 버튼이 없어요.', '서버 관리자(admin) 또는 광고팀(ad_team) 계정으로 로그인했는지 확인하세요.'],
        ]}
      />

      <div className="mt-8 pt-5 border-t border-gray-100 text-xs text-gray-400">
        광고 증빙 요청 시스템 — 사용자 매뉴얼
      </div>
    </>
  );
}

// ============================================================
// 관리자 매뉴얼
// ============================================================

function AdminManual({ urls }: { urls: ManualUrls }) {
  return (
    <>
      {/* ===== 1. 설치 및 초기 설정 ===== */}
      <SectionTitle>1. 설치 및 초기 설정</SectionTitle>

      <SubTitle>사전 요구사항</SubTitle>
      <Table
        headers={['항목', '버전', '확인 명령']}
        rows={[
          ['macOS', '12.0(Monterey) 이상', '애플 메뉴 → 이 Mac에 관하여'],
          ['Node.js', 'v20 이상 (https://nodejs.org)', 'node -v'],
          ['pnpm', 'v10 이상', 'pnpm -v'],
        ]}
      />

      <SubTitle>Node.js 및 pnpm 설치</SubTitle>
      <CodeBlock>{`# Node.js: https://nodejs.org 에서 LTS 버전 설치 후

# pnpm 활성화 (Node.js 설치 후 1회만)
corepack enable
corepack prepare pnpm@latest --activate
pnpm -v  # 버전 확인`}</CodeBlock>

      <SubTitle>프로젝트 의존성 설치</SubTitle>
      <CodeBlock>{`cd 프로젝트폴더
pnpm install`}</CodeBlock>

      <SubTitle>앱 번들 생성</SubTitle>
      <CodeBlock>{`# 빌드 + macOS .app 파일 생성 (바탕화면에 저장)
pnpm create-app

# Applications 폴더로 이동 (선택)
mv ~/Desktop/광고증빙요청시스템.app /Applications/`}</CodeBlock>
      <InfoBox type="tip">
        코드가 업데이트될 때마다 <code>pnpm create-app</code>을 다시 실행해 앱을 재생성하세요.
      </InfoBox>

      {/* ===== 2. 앱 시작 및 종료 ===== */}
      <SectionTitle>2. 앱 시작 및 종료</SectionTitle>

      <SubTitle>시작</SubTitle>
      <p className="text-sm text-gray-700 mb-2">
        바탕화면 또는 <code>/Applications</code> 의 <strong>광고증빙요청시스템</strong> 아이콘을 더블클릭합니다.
      </p>
      <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1 mb-3">
        <li>Electron 제어센터 창이 먼저 열립니다.</li>
        <li><strong>[서버 시작]</strong> 버튼을 누르면 Node.js 백엔드가 기동됩니다.</li>
        <li>기동이 완료되면 서비스 PC 브라우저가 자동으로 열립니다 → <strong>{urls.localBaseUrl}</strong></li>
      </ul>
      <InfoBox type="info">
        다른 PC 사용자에게는 <strong>{urls.publicBaseUrl}</strong> 주소를 안내하세요.
      </InfoBox>

      <SubTitle>이미 실행 중일 때</SubTitle>
      <p className="text-sm text-gray-700 mb-2">
        앱 아이콘을 다시 더블클릭하면 제어센터가 현재 상태에 다시 연결됩니다. 서버는 중복 실행되지 않습니다.
      </p>

      <SubTitle>종료</SubTitle>
      <p className="text-sm text-gray-700">
        제어센터의 <strong>[서버 중지]</strong> 버튼은 서버만 내리고 창은 유지합니다. <strong>[서버 중지 후 종료]</strong> 버튼은 서버를 정상 종료한 뒤 제어센터까지 닫습니다.
      </p>
      <InfoBox type="warning">
        브라우저 탭만 닫아도 서버는 계속 실행됩니다.
        완전히 종료하려면 반드시 제어센터의 <strong>[서버 중지 후 종료]</strong> 버튼을 사용하세요.
      </InfoBox>

      <SubTitle>접속 URL</SubTitle>
      <Table
        headers={['접속 위치', 'URL']}
        rows={[
          ['내부망 사용자 공용 주소', urls.publicBaseUrl],
          ['서비스 PC (로컬)', urls.localBaseUrl],
          ['API 헬스체크', `${urls.localBaseUrl}/api/health`],
        ]}
      />

      {/* ===== 3. 운용 ===== */}
      <SectionTitle>3. 운용</SectionTitle>

      <SubTitle>스토리지 마운트</SubTitle>
      <p className="text-sm text-gray-700 mb-2">
        앱은 스토리지를 자동으로 마운트하지 않습니다. Finder에서 직접 연결해야 합니다.
      </p>
      <Table
        headers={['스토리지', 'SMB 주소', '마운트 경로', '용도']}
        rows={[
          ['Logger Storage', 'smb://10.93.101.100/data', '/Volumes/data', '파일 탐색 (소스)'],
        ]}
      />
      <InfoBox type="info">
        복사 대상은 서버 로컬 스토리지입니다. 공유 NAS 마운트 없이 복사가 가능합니다.
        완료된 파일은 웹 화면에서 직접 다운로드하며, <strong>완료 후 1일이 지나면 자동 삭제</strong>됩니다.
      </InfoBox>
      <CodeBlock>{`# Finder에서 Logger Storage 연결
Finder → 이동 → 서버에 연결 (⌘K) → smb://10.93.101.100/data → 연결

# 또는 터미널로 확인
ls /Volumes/data    # Logger Storage 마운트 확인`}</CodeBlock>
      <InfoBox type="info">
        마운트가 해제되면 파일 탐색이 자동으로 실패 상태가 됩니다.
        업무 시작 전 Logger Storage 마운트 상태를 확인하세요.
      </InfoBox>

      <InfoBox type="info">
        현재 시스템은 개별 사용자 생성 대신 <strong>공용 계정</strong> 체계로 운영됩니다. 별도의 사용자 관리 메뉴는 제공되지 않습니다.
      </InfoBox>

      <SubTitle>역할 체계</SubTitle>
      <Table
        headers={['역할', '설명']}
        rows={[
          ['admin (서버 관리자)', '모든 기능 접근. 채널 매핑 관리, 감사 로그, 통계, 파일 전송 포함.'],
          ['ad_team (광고팀)', '요청 등록/조회, 파일 탐색/승인/복사, 통계 조회 가능.'],
        ]}
      />
      <InfoBox type="info">
        <strong>admin 역할</strong>만 채널 매핑 관리, 감사 로그에 접근할 수 있습니다.
        그 외 모든 기능(요청, 파일 탐색·승인·복사, 통계)은 두 역할 모두 사용 가능합니다.
      </InfoBox>

      <SubTitle>채널 매핑 관리</SubTitle>
      <p className="text-sm text-gray-700 mb-2">
        <strong>[관리자 메뉴] → [채널 매핑 관리]</strong>에서 Logger Storage 채널명과 시스템 내부 채널 폴더명의 대응 관계를 관리합니다.
      </p>
      <Table
        headers={['Logger Storage 폴더명', '화면 표시 채널명']}
        rows={[
          ['CNBC', '비즈'],
          ['ESPN', '스포츠'],
          ['ETV', '라이프'],
          ['FIL', '퍼니'],
          ['GOLF', '골프'],
          ['NICK', '골프2'],
          ['PLUS', '플러스'],
        ]}
      />
      <InfoBox type="info">
        채널은 삭제할 수 없습니다. 더 이상 사용하지 않는 채널은 비활성화 처리하면 요청 등록 드롭다운에서 숨겨집니다.
        내부 폴더명은 로컬 전달 경로 하위 채널 폴더 이름으로도 재사용됩니다.
      </InfoBox>

      <SubTitle>통계 및 감사 로그</SubTitle>
      <Table
        headers={['메뉴', '위치', '내용']}
        rows={[
          ['통계 대시보드', '상단 [통계] 메뉴', '연별/월별/일별 요청 건수, 채널별·광고주별·영업담당자별 분석, CSV 내보내기'],
          ['감사 로그', '관리자 메뉴 → 감사 로그', '공용 계정별 작업 이력 (로그인/요청/승인/반려 등) 날짜·사용자별 필터'],
        ]}
      />

      {/* ===== 4. 유지보수 ===== */}
      <SectionTitle>4. 유지보수</SectionTitle>

      <SubTitle>DB 파일 위치</SubTitle>
      <Table
        headers={['실행 방식', 'DB 경로']}
        rows={[
          ['앱 (광고증빙요청시스템.app)', '~/Library/Application Support/AdCheck/data/adcheck.db'],
          ['개발 서버 (pnpm dev)', '~/Library/Application Support/AdCheck/data/adcheck.db'],
        ]}
      />
      <InfoBox type="info">
        앱과 개발 서버는 <strong>같은 공용 DB</strong>를 사용합니다. 개발 서버에서 확인한 데이터가 앱에도 그대로 반영됩니다.
      </InfoBox>

      <SubTitle>DB 초기화 (완전 리셋)</SubTitle>
      <InfoBox type="danger">
        모든 데이터가 삭제됩니다. 반드시 백업 후 진행하세요.
      </InfoBox>
      <p className="text-sm text-gray-700 mb-2">앱을 완전히 종료한 뒤 실행:</p>
      <CodeBlock>{`rm  ~/Library/Application\\ Support/AdCheck/data/adcheck.db
rm -f ~/Library/Application\\ Support/AdCheck/data/adcheck.db-shm \\
      ~/Library/Application\\ Support/AdCheck/data/adcheck.db-wal`}</CodeBlock>
      <p className="text-sm text-gray-700">앱을 다시 열면 마이그레이션이 자동 실행되고 기본 계정 2개(admin, ad_team)가 새로 생성됩니다.</p>

      <SubTitle>DB 백업</SubTitle>
      <CodeBlock>{`# 날짜별 백업 (30일 보관)
bash 프로젝트폴더/scripts/backup-db.sh`}</CodeBlock>
      <p className="text-sm text-gray-700">백업 파일 저장 위치: <code>~/Library/Application Support/AdCheck/data/backups/</code></p>

      <SubTitle>로그 및 운영 설정 파일</SubTitle>
      <Table
        headers={['파일', '내용']}
        rows={[
          ['app-YYYY-MM-DD.log', '백엔드 로그 + 제어센터 시작/중지 이력'],
          ['control-app.json', '앱 생성 시 저장된 공용 접속 주소/포트 설정'],
          ['session-secret', '설치별 세션 서명 키 (config 디렉토리)'],
        ]}
      />
      <CodeBlock>{`# 로그 실시간 확인
tail -f ~/Library/Application\\ Support/AdCheck/logs/app-$(date +%F).log`}</CodeBlock>

      <SubTitle>코드 업데이트 후 앱 재배포</SubTitle>
      <CodeBlock>{`# 1. 프로젝트 폴더에서 최신 코드 받기 (git 사용 시)
git pull

# 2. 앱 재생성 (빌드 + .app 번들 생성)
pnpm create-app

# 3. 기존 앱 교체
mv ~/Desktop/광고증빙요청시스템.app /Applications/
# 기존 앱을 덮어쓰거나 먼저 삭제 후 이동`}</CodeBlock>

      <SubTitle>문제 해결</SubTitle>
      <Table
        headers={['증상', '원인', '해결']}
        rows={[
          ['앱 더블클릭 후 제어센터가 안 열림', '앱 번들 손상 또는 실행 권한 문제', 'pnpm create-app으로 앱 재생성 후 다시 배치'],
          ['서버 시작이 실패함', '포트 충돌 또는 내부 런타임 파일 누락', '제어센터 최근 로그 확인 후 4000 포트 점유 프로세스 정리'],
          ['앱 실행 후 데이터가 예상과 다름', '공용 DB를 다른 시점에 초기화했거나 운영 데이터가 바뀜', '공용 DB 백업본과 최근 작업 이력을 확인'],
          ['파일 탐색 실패', 'Logger Storage 미마운트', 'Finder → ⌘K → smb://10.93.101.100/data'],
          ['파일 복사 실패', '서버 디스크 공간 부족 또는 권한 문제', '로그 확인 후 디스크 공간 및 LOCAL_DELIVERY_PATH 경로 권한 점검'],
          ['다운로드 실패 (파일 없음)', '1일 자동 삭제 또는 수동 삭제됨', '재전송 요청 후 다시 복사'],
          ['서버 재시작 후 로그아웃', '세션 초기화 (정상)', '재로그인'],
          ['비밀번호 변경 후 로그아웃', '비밀번호 변경 시 보안을 위해 세션 종료 (정상)', '새 비밀번호로 재로그인'],
          ['포트 충돌 (4000)', '이전 프로세스 잔존', 'kill $(lsof -ti:4000)'],
        ]}
      />

      {/* ===== 5. 사용 방법 ===== */}
      <SectionTitle>5. 사용 방법</SectionTitle>

      <p className="text-sm text-gray-700 mb-3">
        관리자는 모든 사용자의 기능을 사용할 수 있습니다. 아래는 전체 업무 흐름입니다.
      </p>

      <SubTitle>전체 처리 흐름</SubTitle>
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 my-3 text-sm text-gray-700 font-mono">
        채널 담당자가 요청 등록<br />
        &nbsp;&nbsp;↓<br />
        대표 담당자 또는 전송 권한이 있는 채널 담당자가 파일 탐색 시작 (Logger Storage 마운트 필요)<br />
        &nbsp;&nbsp;↓<br />
        탐색 완료 → 전송 권한 보유자가 파일 선택<br />
        &nbsp;&nbsp;↓<br />
        승인 → 서버 로컬 스토리지로 자동 복사<br />
        &nbsp;&nbsp;↓<br />
        완료 → 채널 담당자가 [다운로드] 버튼으로 파일 수령 (1일 후 자동 삭제)<br />
        &nbsp;&nbsp;↓<br />
        필요 시 재전송 요청 가능
      </div>

      <SubTitle>요청 등록 (기본 화면)</SubTitle>
      <Table
        headers={['항목', '설명']}
        rows={[
          ['채널', '등록된 활성 채널 목록에서 선택'],
          ['광고주', '텍스트 자유 입력'],
          ['영업 담당자', '행별 입력 (채널마다 다를 수 있음)'],
          ['방송 일자 / 시작·종료 시각', '직접 입력 또는 달력으로 광고 방영 시간대 지정'],
          ['모니터링 시각', '선택. 입력 시 파일 탐색 정확도 향상'],
          ['비고', '요청 전체에 대한 메모'],
          ['행 복사/붙여넣기', '행 오른쪽 버튼으로 같은 내용을 바로 아래에 복제'],
        ]}
      />

      <SubTitle>완료 후 운영 기능</SubTitle>
      <Table
        headers={['기능', '설명']}
        rows={[
          ['재전송 요청', '완료 요청 전체를 다시 복사해야 할 때 사용'],
          ['다운로드', '완료 항목의 파일을 브라우저에서 직접 다운로드. 완료 후 1일이 지나면 자동 삭제됨'],
          ['파일 삭제', '완료 항목의 서버 로컬 복사본을 수동 삭제. 요청/항목 기록은 유지됨'],
          ['오전송 수정', '완료 항목의 채널/일자/시간 정보를 수정해 해당 항목만 다시 탐색 및 복사'],
        ]}
      />

      <SubTitle>요청 상태 설명</SubTitle>
      <StatusTable />

      <SubTitle>관리자 전용 기능</SubTitle>
      <Table
        headers={['기능', '메뉴 위치', '설명']}
        rows={[
          ['요청 삭제', '요청 상세 → 상단 [요청 삭제]', 'admin 전용. 소프트 삭제 (복구 불가).'],
          ['채널 매핑 관리', '관리자 메뉴 → 채널 매핑 관리', 'Logger Storage 폴더명 ↔ 화면 표시 채널명 대응'],
          ['감사 로그', '관리자 메뉴 → 감사 로그', '계정별 작업 이력 조회'],
          ['통계 대시보드', '상단 [통계] 메뉴', '기간별/채널별/광고주별 통계, CSV 내보내기'],
        ]}
      />

      <div className="mt-8 pt-5 border-t border-gray-100 text-xs text-gray-400">
        광고 증빙 요청 시스템 — 관리자 매뉴얼
      </div>
    </>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export default function ManualPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const defaultPublicBaseUrl = 'http://adcheck.tech.net';
  const defaultLocalBaseUrl = 'http://localhost:4000';
  const [urls, setUrls] = useState<ManualUrls>({
    publicBaseUrl: defaultPublicBaseUrl,
    localBaseUrl: defaultLocalBaseUrl,
  });

  // 관리자 매뉴얼에서 탭 전환 (관리자는 사용자 매뉴얼도 볼 수 있음)
  const [viewMode, setViewMode] = useState<'admin' | 'user'>('admin');

  useEffect(() => {
    getHealthInfo()
      .then((health) => {
        setUrls({
          publicBaseUrl: health.public_base_url || defaultPublicBaseUrl,
          localBaseUrl: health.local_base_url || defaultLocalBaseUrl,
        });
      })
      .catch(() => {
        setUrls((current) => ({
          publicBaseUrl: current.publicBaseUrl || defaultPublicBaseUrl,
          localBaseUrl: current.localBaseUrl || defaultLocalBaseUrl,
        }));
      });
  }, [defaultLocalBaseUrl]);

  return (
    <div className="app-page app-page--narrow">
      <PageHeader
        title={isAdmin ? '관리자 매뉴얼' : '사용 가이드'}
        subtitle={isAdmin ? '설치, 운용, 유지보수, 사용자 흐름을 한 문서에서 정리했습니다.' : '요청 등록부터 결과 확인까지 필요한 흐름만 빠르게 볼 수 있습니다.'}
        icon={BookOpen}
      />

      <p className="mb-5 text-sm text-[var(--app-text-soft)]">
        광고 증빙 요청 시스템
        {isAdmin ? ' — 설치·운용·유지보수·사용 방법 전체 가이드' : ' — 사용 방법 가이드'}
      </p>

      {/* 관리자는 탭으로 관리자/사용자 매뉴얼 전환 가능 */}
      {isAdmin && (
        <div className="mb-5 flex gap-2">
          <button
            type="button"
            onClick={() => setViewMode('admin')}
            className={`app-chip ${viewMode === 'admin' ? 'app-chip--active' : ''}`}
          >
            관리자 매뉴얼
          </button>
          <button
            type="button"
            onClick={() => setViewMode('user')}
            className={`app-chip ${viewMode === 'user' ? 'app-chip--active' : ''}`}
          >
            사용자 매뉴얼 미리보기
          </button>
        </div>
      )}

      <div className="app-surface p-6 md:p-8">

      {isAdmin && viewMode === 'admin' ? (
        <AdminManual urls={urls} />
      ) : (
        <UserManual
          role={user?.role ?? 'ad_team'}
          canCopy={true}
          canViewStats={true}
          urls={urls}
        />
      )}
      </div>
    </div>
  );
}
