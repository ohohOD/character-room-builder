# Character Room Builder

생성형 이미지 없이, 공개된 조형 규칙과 HTML5 Canvas 코드로 커뮤니티 캐릭터의 방을 만드는 절차적 인테리어 도구.

> Procedural Canvas furniture and rooms for character communities.

현재 저장소는 아이디어를 잃지 않기 위한 **기획 정본 + 실행 가능한 시각 표본**이다.

## 불변 원칙

1. 생성형 이미지 모델을 사용하지 않는다.
2. 가구와 소품은 코드, 정식 라이선스 스타일 팩, 또는 사용자 제공 에셋만 사용한다.
3. 계정·서버·Google 권한이 없는 로컬 모드가 기본이다.
4. Google Sheets는 선택적 저장/표시 어댑터이며 제품 코어가 아니다.
5. 방 데이터와 렌더러를 분리하고 스키마와 렌더러 버전을 기록한다.
6. 스타일 팩의 작가, 출처, 라이선스를 보존한다.

## 문서

- [제품 기획](docs/PRODUCT.md)
- [아키텍처와 신뢰 경계](docs/ARCHITECTURE.md)
- [방 데이터와 시트 초안](docs/DATA-MODEL.md)
- [오픈소스 조사 메모](docs/RESEARCH-NOTES.md)
- [AI 작업 투명성](docs/AI-ASSISTANCE.md)
- [디자인 락](STYLESEED.md)

## 현재 범위

Canvas2D 아이소메트릭 대표 방, 결정론적 시드, 세 가지 스타일 팩, 임시 방 코드, RoomDocument 기반 가구 렌더링을 포함한다.

/furniture의 Furniture Foundry에서는 아이소메트릭 조립판을 직접 칠해 입체 가구, 바닥 소품, 벽 소품을 만들 수 있다. 재료와 표면색을 따로 고르고 HEX 컬러 코드를 입력할 수 있으며, 실제 사용한 최근 10색만 브라우저 로컬 저장소에 남기거나 직접 지울 수 있다. 결과는 FURN1 URL-safe Base64 코드 또는 URL 해시 링크로 공유하며, 이름·선택적 제작자 표기·라이선스 외의 계정 정보는 수집하지 않는다. Google 연동은 아직 구현하지 않는다.

## 라이선스

코드는 [MIT License](LICENSE)로 배포한다. 향후 스타일 팩과 사용자 에셋은 각각의 출처와 라이선스를 별도로 표시한다.

## 제작 투명성

이 프로젝트는 **OpenAI Codex**와 **Anthropic Claude Code**의 도움을 받아 기획·작성되었다. 도구의 제안은 유지관리자가 검토·선택하며, 프로젝트에 대한 최종 책임은 유지관리자에게 있다.

> Development disclosure: This project has been planned and written with assistance from OpenAI Codex and Anthropic Claude Code. The maintainer reviews and selects suggestions and remains responsible for the project.
