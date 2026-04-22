# 파일 탐색 및 매칭 알고리즘 명세

> 작성일: 2026-03-06
> 목적: Logger Storage 파일명 파싱 규칙과 요청 조건 매칭 알고리즘을 명확히 정의하여
>       파일 탐색 모듈 구현 시 기준으로 사용한다.

---

## 1. Logger Storage 파일명 패턴

```
{채널}_{YYYYMMDD}_{HHMMSS}_{HHMM}.avi
```

| 구성 요소    | 설명                              | 예시           |
|-------------|----------------------------------|----------------|
| `{채널}`    | Logger Storage 폴더명 (채널코드)   | `ETV`          |
| `{YYYYMMDD}`| 녹화 시작 날짜                     | `20260305`     |
| `{HHMMSS}`  | 녹화 시작 시각 (시분초)             | `235955`       |
| `{HHMM}`    | 녹화 종료 시각 (시분, 초 없음)      | `0100`         |

### 실제 예시

```
ETV_20260305_235955_0100.avi
  → 채널:  ETV
  → 시작:  2026-03-05 23:59:55
  → 종료:  2026-03-06 01:00:00  ← 자정을 넘겼으므로 날짜 +1일 적용
```

---

## 2. 파일명 파싱 규칙

### 2-1. 기본 파싱

```
file_date  = YYYYMMDD 파싱 → Date 객체
file_start = file_date + HHMMSS → DateTime 객체
file_end   = file_date + HHMM   → DateTime 객체 (초는 00으로 처리)
```

### 2-2. 자정 넘김 처리 (핵심 엣지 케이스)

종료 시각(HH)이 시작 시각(HH)보다 작으면 녹화가 자정을 넘긴 것이다.
이 경우 종료 날짜에 +1일을 적용한다.

```
조건: file_end의 HH < file_start의 HH
처리: file_end 날짜 = file_date + 1일

예시:
  ETV_20260305_235955_0100.avi
    file_start = 2026-03-05 23:59:55
    file_end   = 2026-03-05 01:00:00  ← 파싱 직후 (잘못된 상태)
    23 > 01 이므로 자정 넘김 감지
    file_end   = 2026-03-06 01:00:00  ← +1일 보정 후 (올바른 상태)
```

이 처리를 누락하면 파일 범위가 음수(-23시간)가 되어 매칭이 완전히 깨진다.

### 2-3. 동일 시각 처리 (예외)

종료 HH == 시작 HH이고 종료 MM < 시작 MM인 경우도 자정 넘김으로 처리한다.
(예: 시작 00:30, 종료 00:00 → 1시간30분짜리 파일)

---

## 3. 요청 조건 → 탐색 파라미터 변환

광고팀이 입력하는 값:

| 입력 필드         | DB 컬럼              | 설명                          |
|-----------------|---------------------|-------------------------------|
| 채널 (화면 표시명) | `channel_mapping_id` | "라이프" → ETV 폴더로 매핑      |
| 방송일자          | `broadcast_date`     | YYYY-MM-DD                    |
| 요청 시간대 시작   | `req_time_start`     | HH:MM                         |
| 요청 시간대 종료   | `req_time_end`       | HH:MM                         |
| 모니터링 송출 시간 | `monitoring_time`    | HH:MM 또는 HH:MM:SS            |

### 요청 범위 절대 datetime 변환

요청 시간대도 자정 넘김이 가능하다.

```
req_start = broadcast_date + req_time_start
req_end   = broadcast_date + req_time_end
조건: req_end < req_start → req_end 날짜 +1일

예시:
  broadcast_date = 2026-03-05
  req_time_start = 23:30
  req_time_end   = 01:00
  → req_start = 2026-03-05 23:30:00
  → req_end   = 2026-03-06 01:00:00  ← +1일 적용
```

---

## 4. 파일 탐색 경로 결정

```
1. channel_mappings 테이블에서 channel_mapping_id로 storage_folder 조회
   예: channel_mapping_id=3 → storage_folder='ETV'

2. 기본 탐색 경로
   {LOGGER_STORAGE_MOUNT}/{storage_folder}/{YYYY-MM-DD}/
   예: /Volumes/LoggerStorage/ETV/2026-03-05/

3. 자정 넘김 요청인 경우 → 다음날 폴더도 함께 탐색
   /Volumes/LoggerStorage/ETV/2026-03-05/
   /Volumes/LoggerStorage/ETV/2026-03-06/  ← 추가 탐색
```

---

## 5. 매칭 점수 계산 (match_score: 0~100)

각 파일에 대해 아래 기준으로 점수를 계산하여 `file_search_results.match_score`에 저장한다.

### 5-1. 점수 기준표

| 조건                                          | 점수   |
|----------------------------------------------|-------|
| monitoring_time이 파일 범위(start~end) 내 포함  | +60점  |
| 요청 시간대와 파일 범위가 겹침(overlap 있음)      | +30점  |
| 겹침 비율이 요청 범위의 50% 이상               | +10점  |

최대 100점. 0점 파일은 결과에 포함하지 않는다.

### 5-2. monitoring_time 포함 판단 (핵심 기준)

```
monitoring_datetime = broadcast_date + monitoring_time
(자정 넘김 처리 동일하게 적용)

포함 조건: file_start <= monitoring_datetime < file_end
```

monitoring_time이 파일 범위에 포함되면 "광고가 실제로 이 파일 안에 있다"는
가장 강한 근거가 된다.

### 5-3. 겹침(overlap) 계산

```
overlap_start = max(req_start, file_start)
overlap_end   = min(req_end, file_end)
겹침 있음: overlap_start < overlap_end

겹침 비율 = (overlap_end - overlap_start) / (req_end - req_start)
```

### 5-4. match_reason 예시 (기술팀 검토용 설명)

```
"모니터링 송출시간(23:50)이 파일 범위(23:59~01:00) 밖 - 이전 파일 확인 필요"
"모니터링 송출시간(00:15)이 파일 범위(23:59~01:00) 내 포함 - 높은 신뢰도"
"요청 시간대(23:30~01:00)와 파일 범위(23:59~01:00) 겹침(61분) - 요청 범위 내 파일"
```

---

## 6. 탐색 결과 저장 및 기술팀 선택

탐색된 파일은 `file_search_results` 테이블에 모두 저장한다.

```
저장 항목:
  - file_path      : 절대 경로 (/Volumes/LoggerStorage/ETV/2026-03-05/ETV_20260305_235955_0100.avi)
  - file_name      : 파일명
  - file_size_bytes: 실제 파일 크기 (bytes)
  - file_start_time: 파싱된 시작 시각 (HH:MM:SS)
  - file_end_time  : 보정된 종료 시각 (HH:MM:SS, 자정 넘김 포함 표시)
  - file_mtime     : OS 파일 수정 시각
  - match_score    : 0~100
  - match_reason   : 매칭 근거 설명 (한글)
  - is_selected    : 기술팀이 최종 선택 시 1로 업데이트
```

화면에는 match_score 내림차순으로 표시하고,
기술팀이 최종 파일 1개를 선택(is_selected=1)한 뒤 승인한다.

---

## 7. 복사 경로 결정

기술팀 승인 후 `copy_jobs` 테이블에 다음 경로로 복사 작업을 등록한다.

```
source_path = file_search_results.file_path
            = /Volumes/LoggerStorage/{storage_folder}/{YYYY-MM-DD}/{파일명}

dest_path   = {SHARED_NAS_MOUNT}/{nas_folder}/{YYYY-MM-DD}/{파일명}
            = /Volumes/SharedNAS/{nas_folder}/{broadcast_date}/{파일명}

예시:
  source: /Volumes/LoggerStorage/ETV/2026-03-05/ETV_20260305_235955_0100.avi
  dest:   /Volumes/SharedNAS/라이프/2026-03-05/ETV_20260305_235955_0100.avi
```

`nas_folder`는 `channel_mappings.nas_folder`에서 조회한다.
대상 폴더가 없으면 복사 전 자동 생성한다.

---

## 8. 처리 불가 케이스 및 대응

| 케이스                          | 대응 방법                                         |
|-------------------------------|--------------------------------------------------|
| Logger Storage 마운트 안 됨     | 탐색 전 마운트 상태 확인 → 미마운트 시 에러 반환      |
| 해당 날짜 폴더 없음              | match_score=0, match_reason="폴더 없음" 기록       |
| 매칭 파일 0건                   | request_item.item_status='failed', 기술팀 수동 처리 |
| monitoring_time이 범위 밖       | 낮은 score로 저장 + match_reason에 경고 표시        |
| 공유 NAS 마운트 안 됨           | 복사 시작 전 확인 → 미마운트 시 copy_job 생성 보류   |
| 동일 item에 done 상태 job 존재   | 앱 레벨에서 중복 복사 차단 (copy_jobs 조회 선행)      |
