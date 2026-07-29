# Character Room Builder · 복셀 가구 에디터

생성형 이미지 없이, 공개된 조형 규칙과 HTML5 Canvas 코드로 아이소메트릭 복셀 가구를 만들고 어디서든 쓸 수 있게 내보내는 로컬 제작 도구.

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
- [Furniture Foundry 로드맵](docs/FOUNDRY-ROADMAP.md)
- [오픈소스 조사 메모](docs/RESEARCH-NOTES.md)
- [AI 작업 투명성](docs/AI-ASSISTANCE.md)
- [디자인 락](STYLESEED.md)

## 현재 범위

기본 화면은 Furniture Foundry이며 Room Composer는 `/room`의 배치 쇼룸으로 남는다. 기존 `/furniture#FURN1...` 공유 링크도 계속 복원된다. Room Composer는 FURN1 가구를 불러와 바닥·벽에 클릭 배치하고 이동·회전·삭제할 수 있으며, 배치 결과를 방 코드에 포함한다.

Furniture Foundry에서는 아이소메트릭 조립판을 직접 칠해 입체 가구, 바닥 소품, 벽 소품을 만들 수 있다. 같은 가구 데이터를 아이소메트릭·정면·측면·평면에서 단면별로 편집하며, 외형 크기를 유지하는 1×·2×·4× 조립을 전환할 수 있다. 4× 편집 데이터는 빈 칸을 저장하지 않고 FURN1에서 같은 재료의 가로 구간을 묶는다. 로컬 이미지를 원하는 도트 크기·팔레트·투명도·디더링으로 미리 보고 벽·바닥 패널, 밝기·알파 부조, 앞·옆·위 visual hull로 변환할 수 있다. 원본·EXIF·파일 경로는 저장하거나 공유하지 않는다. 화면 확대·이동, 자유 격자 크기, 실행 취소·다시 실행, 영역 이동·복제·회전·반전, 채우기와 스포이트를 제공한다. 재료와 표면색을 따로 고르고 HEX 컬러 코드를 입력할 수 있으며, 실제 사용한 최근 10색만 브라우저 로컬 저장소에 남기거나 직접 지울 수 있다. 결과는 FURN1 코드·해시 링크뿐 아니라 투명 PNG·WebP, 4·8방향 PNG 시트, 8방향 회전 GIF·애니메이션 WebP로 브라우저 안에서 내보낼 수 있다. 이미지 제작 ZIP과 함께, 재질·FURN1·권리 정보를 담은 GLB 및 OBJ·MTL·메타데이터 ZIP도 제공한다. 이름·선택적 제작자 표기·라이선스 외의 계정 정보는 수집하지 않는다. Google 연동은 아직 구현하지 않는다.

## GitHub Pages 배포

`npm run build:github-pages`는 `/character-room-builder/` 기준의 완전한 정적 사이트를 `out/`에 만든다. 빌드 중 Next.js 텔레메트리는 비활성화하며, 결과물은 `ohohOD/ohohod.github.io` 저장소의 같은 이름 디렉터리에 게시한다.

## 라이선스

코드는 [MIT License](LICENSE)로 배포한다. 향후 스타일 팩과 사용자 에셋은 각각의 출처와 라이선스를 별도로 표시한다.

## 제작 투명성

이 프로젝트는 **OpenAI Codex**와 **Anthropic Claude Code**의 도움을 받아 기획·작성되었다. 도구의 제안은 유지관리자가 검토·선택하며, 프로젝트에 대한 최종 책임은 유지관리자에게 있다.

> Development disclosure: This project has been planned and written with assistance from OpenAI Codex and Anthropic Claude Code. The maintainer reviews and selects suggestions and remains responsible for the project.
