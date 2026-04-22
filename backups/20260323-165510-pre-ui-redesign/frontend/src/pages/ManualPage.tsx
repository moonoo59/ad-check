/**
 * 매뉴얼 페이지
 *
 * 역할에 따라 다른 매뉴얼을 표시한다.
 * - admin    → 관리자 매뉴얼 (설치/시작/운용/유지보수/사용방법 전체)
 * - 그 외    → 사용자 매뉴얼 (접속/사용방법)
 *
 * useAuth()로 현재 사용자 역할을 확인해 렌더링을 분기한다.
 */

import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';

// ============================================================
// 공통 레이아웃 컴포넌트
// ============================================================

/** 섹션 제목 */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-bold text-gray-900 mt-10 mb-3 pb-2 border-b-2 border-blue-100">
      {children}
    </h2>
  );
}

/** 소제목 */
function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-bold text-gray-800 mt-6 mb-2">
      {children}
    </h3>
  );
}

/** 코드 블록 */
function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-gray-900 text-green-400 text-sm rounded p-4 overflow-x-auto my-3 font-mono leading-relaxed whitespace-pre-wrap">
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
    info:    'bg-blue-50  border-blue-300  text-blue-900',
    warning: 'bg-yellow-50 border-yellow-400 text-yellow-900',
    tip:     'bg-green-50  border-green-400  text-green-900',
    danger:  'bg-red-50    border-red-400    text-red-900',
  };
  const labels = { info: '안내', warning: '주의', tip: '팁', danger: '경고' };

  return (
    <div className={`border-l-4 px-4 py-3 my-3 rounded-r text-sm ${styles[type]}`}>
      <span className="font-bold mr-2">[{labels[type]}]</span>
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
    <div className="overflow-x-auto my-3">
      <table className="w-full text-sm border border-gray-200 rounded">
        <thead className="bg-gray-50">
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="text-left px-3 py-2 font-semibold text-gray-700 border-b border-gray-200"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-gray-100 hover:bg-gray-50">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-gray-700 align-top">
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
    <div className="flex gap-4 my-4">
      <div className="shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center mt-0.5">
        {num}
      </div>
      <div className="flex-1">
        <p className="font-semibold text-gray-900 mb-1">{title}</p>
        <div className="text-sm text-gray-700">{children}</div>
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
        ['대기 중', '요청이 등록되었고 자동 탐색 시작 전이거나 준비 중인 상태.', '자동으로 탐색이 시작되거나 기술팀 확인'],
        ['탐색 중', 'Logger Storage를 스캔하며 후보 파일을 찾는 중.', '5초마다 자동 갱신'],
        ['탐색 완료', '후보 파일이 준비되었고 기술팀이 100% 매칭 파일을 선택할 수 있는 상태.', '기술팀이 파일 선택 후 승인 또는 반려'],
        ['승인됨', '복사 실행 직전 상태. 재전송 요청 후에도 이 상태로 돌아올 수 있음.', '기술팀이 복사 실행'],
        ['복사 중', '선택된 파일을 공유 NAS로 복사하는 중.', '10초마다 자동 갱신'],
        ['완료', '파일 복사까지 모두 완료된 상태.', '필요 시 재전송 요청, 파일 삭제, 오전송 수정'],
        ['요청 수정중', '완료 요청의 일부 항목을 수정해 다시 탐색/복사하는 중.', '수정 항목 파일 선택 후 복사 실행'],
        ['반려', '기술팀 또는 관리자가 반려 처리한 상태.', '반려 사유 확인 후 새 요청 등록'],
        ['실패', '파일 탐색 또는 복사 단계에서 오류가 발생한 상태.', '탐색 재시도 또는 복사 재시도'],
      ]}
    />
  );
}

// ============================================================
// 사용자 매뉴얼 (광고팀 / 기술팀)
// ============================================================

function UserManual({ role }: { role: string }) {
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
          ['같은 PC에서 접속', 'http://localhost:4000'],
          ['다른 PC에서 접속', '관리자에게 서버 IP 주소 문의'],
        ]}
      />

      <SubTitle>초기 로그인</SubTitle>
      <p className="text-sm text-gray-700 mb-2">
        계정은 관리자가 생성합니다. 최초 로그인 후 반드시 비밀번호를 변경하세요.
      </p>
      <InfoBox type="warning">
        초기 비밀번호는 <strong>adcheck2026</strong> 입니다. 로그인 후 우측 상단 → <strong>[비밀번호 변경]</strong> 에서 즉시 변경하세요.
      </InfoBox>

      {/* ===== 2. 광고팀 사용 방법 ===== */}
      {(role === 'ad_team' || role === 'admin') && (
        <>
          <SectionTitle>2. 광고팀 — 증빙 요청 등록</SectionTitle>

          <Step num={1} title="요청 등록 화면으로 이동">
            상단 메뉴의 <strong>[요청 등록]</strong>을 클릭합니다.
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

      {/* ===== 3. 기술팀 사용 방법 ===== */}
      {(role === 'tech_team' || role === 'admin') && (
        <>
          <SectionTitle>3. 기술팀 — 파일 탐색 및 승인</SectionTitle>

          <InfoBox type="warning">
            파일 탐색을 시작하기 전 Logger Storage(녹화 서버)가 마운트되어 있어야 합니다.
            파일 복사를 위해서는 공유 NAS도 마운트되어 있어야 합니다.
            마운트가 안 되어 있으면 관리자에게 요청하세요.
          </InfoBox>

          <Step num={1} title="접수된 요청 확인">
            <strong>[요청 목록]</strong>에서 <strong>접수됨</strong> 상태의 요청을 클릭합니다.
          </Step>

          <Step num={2} title="파일 탐색 시작">
            요청 상세 화면에서 <strong>[파일 탐색 시작]</strong> 버튼을 클릭합니다.
            백그라운드에서 Logger Storage를 자동 스캔합니다. 화면은 5초마다 자동 갱신됩니다.
          </Step>

          <Step num={3} title="파일 선택">
            <p className="mb-2">탐색 완료 후 각 요청 항목별로 정확도 100% 후보 파일 목록이 표시됩니다.</p>
            <Table
              headers={['매칭 점수', '의미', '처리']}
              rows={[
                ['100%', '모니터링 시각이 포함된 파일 (가장 정확)', '라디오 버튼으로 선택'],
              ]}
            />
            라디오 버튼으로 파일을 선택하면 자동 저장됩니다. (별도 저장 버튼 없음)
          </Step>

          <Step num={4} title="승인 또는 반려">
            <p>모든 항목에 파일이 선택되면 <strong>[승인 및 복사 실행]</strong> 버튼이 활성화됩니다.</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>승인</strong>: 선택된 파일을 공유 NAS로 자동 복사합니다. 복사 진행률이 실시간으로 표시됩니다.</li>
              <li><strong>반려</strong>: 사유를 입력하고 반려 처리합니다. 광고팀이 재요청할 수 있습니다.</li>
            </ul>
          </Step>

          <SubTitle>오류 처리</SubTitle>
          <Table
            headers={['상황', '처리 방법']}
            rows={[
              ['탐색 실패 (Logger Storage 미마운트)', '관리자에게 마운트 요청 후 [탐색 재시도] 클릭'],
              ['복사 실패 (공유 NAS 미마운트)',        '관리자에게 마운트 요청 후 [복사 재시도] 클릭'],
              ['파일이 탐색되지 않음',                '방송 날짜·채널 확인 후 [탐색 재시도] 클릭'],
            ]}
          />

          <SubTitle>완료 후 파일 삭제 / 오전송 수정</SubTitle>
          <Table
            headers={['기능', '설명']}
            rows={[
              ['파일 삭제', '완료 항목의 공유 NAS 복사본만 삭제합니다. 요청/항목 기록은 유지됩니다.'],
              ['오전송 수정', '채널/방송일자/시간대/송출 시간을 수정하면 해당 항목만 다시 탐색되고 요청 상태가 "요청 수정중"으로 바뀝니다.'],
            ]}
          />
        </>
      )}

      {/* ===== 4. 요청 상태 설명 ===== */}
      <SectionTitle>4. 요청 상태 설명</SectionTitle>
      <StatusTable />

      {/* ===== 5. 자주 묻는 질문 ===== */}
      <SectionTitle>5. 자주 묻는 질문</SectionTitle>
      <Table
        headers={['질문', '답변']}
        rows={[
          ['서버 재시작 후 로그아웃됐어요.', '정상입니다. 세션은 서버 재시작 시 초기화됩니다. 재로그인하세요.'],
          ['파일 탐색은 얼마나 걸리나요?', '채널당 수백 개 파일을 스캔하며, 보통 수 초~수십 초 내에 완료됩니다.'],
          ['완료된 요청을 다시 복사해야 해요.', '요청 상세 → [재전송 요청] 버튼을 클릭하고 사유를 입력하세요.'],
          ['완료된 파일만 지우고 싶어요.', '기술팀/관리자는 요청 상세의 완료 항목에서 [파일 삭제]를 사용할 수 있습니다.'],
          ['채널이 드롭다운에 없어요.', '관리자에게 채널 매핑 등록을 요청하세요.'],
          ['비밀번호를 잊어버렸어요.', '관리자에게 비밀번호 초기화를 요청하세요.'],
        ]}
      />

      <div className="mt-10 pt-6 border-t border-gray-100 text-xs text-gray-400">
        광고 증빙 요청 시스템 — 사용자 매뉴얼
      </div>
    </>
  );
}

// ============================================================
// 관리자 매뉴얼
// ============================================================

function AdminManual() {
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
        <li>Node.js 백엔드가 자동 기동됩니다.</li>
        <li>브라우저가 자동으로 열립니다 → <strong>http://localhost:4000</strong></li>
        <li>작은 다이얼로그 창이 표시됩니다 (앱이 실행 중임을 나타냄).</li>
      </ul>

      <SubTitle>이미 실행 중일 때</SubTitle>
      <p className="text-sm text-gray-700 mb-2">
        앱 아이콘을 다시 더블클릭하면 브라우저만 다시 열립니다. 서버는 중복 실행되지 않습니다.
      </p>

      <SubTitle>종료</SubTitle>
      <p className="text-sm text-gray-700">
        다이얼로그 창의 <strong>[종료]</strong> 버튼을 클릭합니다. 백엔드 프로세스가 정상 종료됩니다.
      </p>
      <InfoBox type="warning">
        다이얼로그를 닫지 않고 브라우저 탭만 닫아도 서버는 계속 실행됩니다.
        완전히 종료하려면 반드시 다이얼로그의 [종료] 버튼을 사용하세요.
      </InfoBox>

      <SubTitle>접속 URL</SubTitle>
      <Table
        headers={['접속 위치', 'URL']}
        rows={[
          ['서비스 PC (로컬)', 'http://localhost:4000'],
          ['API 헬스체크', 'http://localhost:4000/api/health'],
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
          ['공유 NAS', 'smb://58.234.220.242/광고', '/Volumes/광고', '파일 복사 (대상)'],
        ]}
      />
      <CodeBlock>{`# Finder에서 연결
Finder → 이동 → 서버에 연결 (⌘K) → SMB 주소 입력 → 연결

# 또는 터미널로 확인
ls /Volumes/data    # Logger Storage 마운트 확인
ls /Volumes/광고     # 공유 NAS 마운트 확인`}</CodeBlock>
      <InfoBox type="info">
        마운트가 해제되면 파일 탐색·복사가 자동으로 실패 상태가 됩니다.
        업무 시작 전 마운트 상태를 확인하세요.
      </InfoBox>

      <SubTitle>사용자 관리</SubTitle>
      <p className="text-sm text-gray-700 mb-2">
        상단 <strong>[관리자 메뉴] → [사용자 관리]</strong>에서 계정을 관리합니다.
      </p>
      <Table
        headers={['기능', '방법']}
        rows={[
          ['계정 생성',       '[+ 사용자 추가] 버튼 → 계정명/표시명/역할/초기 비밀번호 입력'],
          ['역할 변경',       '목록에서 행 클릭 → 역할 수정 → 저장'],
          ['계정 비활성화',   '목록에서 행 클릭 → 활성 상태 OFF → 저장 (계정 삭제 불가)'],
          ['비밀번호 초기화', '행 클릭 → [비밀번호 초기화] → 임시 비밀번호 생성'],
        ]}
      />
      <Table
        headers={['역할', '권한']}
        rows={[
          ['admin (관리자)', '모든 기능 + 사용자 관리/채널 매핑/통계/감사 로그'],
          ['tech_team (기술팀)', '파일 탐색 시작, 파일 선택, 승인/반려, 복사 재시도'],
          ['ad_team (광고팀)', '요청 등록, 전체 요청 목록 조회, 재전송 요청'],
        ]}
      />

      <SubTitle>채널 매핑 관리</SubTitle>
      <p className="text-sm text-gray-700 mb-2">
        <strong>[관리자 메뉴] → [채널 매핑 관리]</strong>에서 Logger Storage 채널명과 공유 NAS 폴더명의 대응 관계를 관리합니다.
      </p>
      <Table
        headers={['Logger Storage 폴더', '공유 NAS 폴더']}
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
      </InfoBox>

      <SubTitle>통계 및 감사 로그</SubTitle>
      <Table
        headers={['메뉴', '내용']}
        rows={[
          ['통계 대시보드', '연별/월별/일별 요청 건수, 채널별·광고주별·영업담당자별 분석, CSV 내보내기'],
          ['감사 로그', '전체 사용자 작업 이력 (로그인/요청/승인/반려 등) 날짜·사용자별 필터'],
        ]}
      />

      {/* ===== 4. 유지보수 ===== */}
      <SectionTitle>4. 유지보수</SectionTitle>

      <SubTitle>DB 파일 위치</SubTitle>
      <Table
        headers={['실행 방식', 'DB 경로']}
        rows={[
          ['앱 (광고증빙요청시스템.app)', '~/Library/Application Support/AdCheck/data/adcheck.db'],
          ['개발 서버 (pnpm dev)', '프로젝트폴더/backend/data/adcheck.db'],
        ]}
      />
      <InfoBox type="danger">
        앱과 개발 서버는 <strong>서로 다른 DB</strong>를 사용합니다. 개발 서버에서 입력한 데이터는 앱에서 보이지 않습니다.
      </InfoBox>

      <SubTitle>개발 서버 DB → 앱 DB 복사</SubTitle>
      <p className="text-sm text-gray-700 mb-2">앱을 완전히 종료한 뒤 실행:</p>
      <CodeBlock>{`cp 프로젝트폴더/backend/data/adcheck.db \\
   ~/Library/Application\\ Support/AdCheck/data/adcheck.db

# WAL/SHM 잔여 파일 제거
rm -f ~/Library/Application\\ Support/AdCheck/data/adcheck.db-shm \\
      ~/Library/Application\\ Support/AdCheck/data/adcheck.db-wal`}</CodeBlock>

      <SubTitle>DB 초기화 (완전 리셋)</SubTitle>
      <InfoBox type="danger">
        모든 데이터가 삭제됩니다. 반드시 백업 후 진행하세요.
      </InfoBox>
      <p className="text-sm text-gray-700 mb-2">앱을 완전히 종료한 뒤 실행:</p>
      <CodeBlock>{`rm  ~/Library/Application\\ Support/AdCheck/data/adcheck.db
rm -f ~/Library/Application\\ Support/AdCheck/data/adcheck.db-shm \\
      ~/Library/Application\\ Support/AdCheck/data/adcheck.db-wal`}</CodeBlock>
      <p className="text-sm text-gray-700">앱을 다시 열면 마이그레이션이 자동 실행되고 기본 계정 3개(admin/tech1/ad1, 비밀번호: adcheck2026)가 새로 생성됩니다.</p>

      <SubTitle>DB 백업</SubTitle>
      <CodeBlock>{`# 날짜별 백업 (30일 보관)
bash 프로젝트폴더/scripts/backup-db.sh`}</CodeBlock>
      <p className="text-sm text-gray-700">백업 파일 저장 위치: <code>~/Library/Application Support/AdCheck/data/backups/</code></p>

      <SubTitle>로그 확인</SubTitle>
      <Table
        headers={['파일', '내용']}
        rows={[
          ['app.log', '서버 전체 실행 로그 (날짜별 분리)'],
          ['launcher.log', '앱 시작/종료 이력'],
          ['build.log', '앱 자동 빌드 로그'],
        ]}
      />
      <CodeBlock>{`# 로그 실시간 확인
tail -f ~/Library/Application\\ Support/AdCheck/logs/app.log`}</CodeBlock>

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
          ['앱 더블클릭해도 브라우저 안 열림', 'Node.js 경로 문제', 'Node.js v20 이상 재설치 확인'],
          ['앱 실행 후 데이터 없음', '앱/개발 서버 DB 분리', '위 DB 복사 절차 수행 (앱 종료 후)'],
          ['파일 탐색 실패', 'Logger Storage 미마운트', 'Finder → ⌘K → smb://10.93.101.100/data'],
          ['파일 복사 실패', '공유 NAS 미마운트', 'Finder → ⌘K → smb://58.234.220.242/광고'],
          ['서버 재시작 후 로그아웃', '세션 초기화 (정상)', '재로그인'],
          ['포트 충돌 (4000)', '이전 프로세스 잔존', 'kill $(lsof -ti:4000)'],
        ]}
      />

      {/* ===== 5. 사용 방법 ===== */}
      <SectionTitle>5. 사용 방법</SectionTitle>

      <p className="text-sm text-gray-700 mb-4">
        관리자는 광고팀·기술팀의 모든 기능을 사용할 수 있습니다. 아래는 전체 업무 흐름입니다.
      </p>

      <SubTitle>전체 처리 흐름</SubTitle>
      <div className="bg-gray-50 border border-gray-200 rounded p-4 my-3 text-sm text-gray-700 font-mono">
        광고팀 요청 등록<br />
        &nbsp;&nbsp;↓<br />
        기술팀 파일 탐색 시작 (Logger Storage 마운트 필요)<br />
        &nbsp;&nbsp;↓<br />
        탐색 완료 → 기술팀 파일 선택<br />
        &nbsp;&nbsp;↓<br />
        승인 → 공유 NAS로 자동 복사 (공유 NAS 마운트 필요)<br />
        &nbsp;&nbsp;↓<br />
        완료 (광고팀에서 재전송 요청 가능)
      </div>

      <SubTitle>요청 등록 (화면 1)</SubTitle>
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

      <SubTitle>파일 탐색 결과 및 매칭 점수 (화면 3)</SubTitle>
      <Table
        headers={['점수', '의미', '처리']}
        rows={[
          ['100%', '모니터링 시각이 포함된 파일', '선택 후 승인/복사'],
        ]}
      />

      <SubTitle>완료 후 운영 기능</SubTitle>
      <Table
        headers={['기능', '설명']}
        rows={[
          ['재전송 요청', '완료 요청 전체를 다시 복사해야 할 때 사용'],
          ['파일 삭제', '완료 항목의 공유 NAS 복사본만 삭제하고 이력을 남김'],
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
          ['채널 매핑 관리', '관리자 메뉴 → 채널 매핑 관리', 'Logger Storage ↔ 공유 NAS 폴더명 대응'],
          ['사용자 관리', '관리자 메뉴 → 사용자 관리', '계정 생성/역할 변경/비밀번호 초기화'],
          ['통계 대시보드', '관리자 메뉴 → 통계 대시보드', '기간별/채널별/광고주별 통계, CSV 내보내기'],
          ['감사 로그', '관리자 메뉴 → 감사 로그', '전체 작업 이력 조회'],
        ]}
      />

      <div className="mt-10 pt-6 border-t border-gray-100 text-xs text-gray-400">
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

  // 관리자 매뉴얼에서 탭 전환 (관리자는 사용자 매뉴얼도 볼 수 있음)
  const [viewMode, setViewMode] = useState<'admin' | 'user'>('admin');

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <PageHeader title={isAdmin ? '관리자 매뉴얼' : '사용 가이드'} />

      <p className="text-sm text-gray-500 mt-1 mb-6">
        광고 증빙 요청 시스템
        {isAdmin ? ' — 설치·운용·유지보수·사용 방법 전체 가이드' : ' — 사용 방법 가이드'}
      </p>

      {/* 관리자는 탭으로 관리자/사용자 매뉴얼 전환 가능 */}
      {isAdmin && (
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setViewMode('admin')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              viewMode === 'admin'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            관리자 매뉴얼
          </button>
          <button
            type="button"
            onClick={() => setViewMode('user')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              viewMode === 'user'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            사용자 매뉴얼 미리보기
          </button>
        </div>
      )}

      {/* 렌더링 분기:
          - admin + 관리자 탭 → AdminManual
          - admin + 사용자 탭 → UserManual (미리보기, role='admin'으로 전달 → 전체 섹션 표시)
          - 일반 사용자      → UserManual (역할에 맞는 섹션만 표시)
      */}
      {isAdmin && viewMode === 'admin' ? (
        <AdminManual />
      ) : (
        <UserManual role={user?.role ?? 'ad_team'} />
      )}
    </div>
  );
}
