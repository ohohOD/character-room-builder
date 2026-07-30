# Project-local agent skills

이 디렉터리의 스킬은 Character Room Builder의 UI 검토에만 사용한다. 제품 런타임이나 배포 산출물에는 포함되지 않는다.

## 설치된 스킬

- `responsive-design`: 모바일·좁은 화면·컨테이너·고밀도 UI의 레이아웃 전략과 리플로 검증
- `web-accessibility`: 데스크톱을 포함한 웹 UI의 계층·상태·사용성·접근성 감사와 수동 검증

두 스킬은 [`akillness/jeo-skills`](https://github.com/akillness/jeo-skills)의 커밋
`21d76364fd2ea05be28f8d3d23697f810d22aca5`에서 프로젝트 로컬로 설치했다. 각 `SKILL.md`의 라이선스 메타데이터는 MIT로 선언되어 있다. 원본 저장소의 해당 커밋에는 두 스킬에 적용되는 별도 루트 `LICENSE` 파일이 없으므로, 이 기록은 메타데이터 선언의 범위를 넘어선 라이선스 보증을 의미하지 않는다.

스킬은 저장소 파일을 자동으로 수정하거나 외부 명령을 실행하는 훅을 포함하지 않는다. 실제 UI 변경은 루트 `AGENTS.md`, `STYLESEED.md`, 제품 문서와 프로젝트 검증 절차를 우선한다.
