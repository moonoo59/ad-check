# Portfolio — 광고 증빙 요청 자동화 시스템

## 열람 방법

```bash
# 브라우저에서 바로 열기 (CDN 필요)
open portfolio/index.html

# 또는 로컬 서버로 실행 (CDN 없이도 동작)
npx serve portfolio/
```

> Mermaid 아키텍처 다이어그램은 CDN 연결이 필요합니다.

## 스크린샷 삽입 방법

1. `portfolio/screenshots/` 에 이미지 파일 추가 (PNG, JPG)
2. `portfolio/index.html` 의 `#screenshots` 섹션 placeholder를 `<img>` 태그로 교체

## PDF 내보내기

Chrome/Safari에서 `Cmd+P` → "PDF로 저장" 선택.
배경색을 포함하려면 "배경 그래픽" 옵션 활성화.

## GitHub Pages 배포

```bash
# portfolio/ 디렉토리를 gh-pages 브랜치로 배포
git subtree push --prefix portfolio origin gh-pages
```

---

## 공개 전 민감 정보 체크리스트

배포 또는 공유 전 아래 항목을 반드시 확인하세요.

- [ ] 실제 IP 주소 미포함 (`grep -E "10\.|192\.|172\."`)
- [ ] 실제 채널명 미포함 (`grep -iE "CNBC|ESPN|ETV|GOLF|NICK|PLUS|FIL"`)
- [ ] 회사명 미포함
- [ ] 사내망 도메인/호스트명 미포함
- [ ] Logger Storage 실제 마운트 경로 미포함
- [ ] GitHub 링크가 공개 repo를 가리키는지 확인

```bash
# 원스텝 검사 명령어
grep -iE "10\.93|58\.234|CNBC|ESPN|ETV|GOLF|NICK|PLUS|FIL|[Cc]ompany" portfolio/index.html
# 결과 0줄이어야 정상
```
