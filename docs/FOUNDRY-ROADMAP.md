# 복셀 가구 에디터(Furniture Foundry) 로드맵

복셀 가구 에디터(Furniture Foundry)는 이 프로젝트의 기본 제작 도구다. Room Composer는 결과를 시험 배치하고 ROOM 코드로 공유하는 쇼룸이며, 공방 산출물의 유일한 사용처가 아니다.

## 현재 제공

- 입체·바닥·벽 조립면과 1×·2×·4× 해상도
- 재료, 임의 HEX 표면색, 최근 10색의 기기 로컬 이력
- 결정론적 FURN1 코드와 URL fragment 공유
- 투명·종이 배경 PNG/WebP 단일 이미지
- 입체·바닥 가구의 4방향 PNG 스프라이트 시트
- 입체·바닥 가구의 8방향 PNG 시트와 반복 GIF·애니메이션 WebP
- 이미지·FURN1·프레임/바닥 기준점 JSON·LICENSE를 보존하는 ZIP 묶음
- 외곽선·재질 경계와 바닥 그림자 선택
- FURN1 가구의 Room Composer 배치와 ROOM1 포함
- 데이터 해상도와 분리된 50~300% 화면 확대·축소와 이동
- 자유로운 조립판 크기, 최대 80단계 실행 취소·다시 실행
- 영역 선택·이동·복제·회전·반전·층 이동, 채우기와 스포이트
- 같은 FurnitureDefinition을 직접 편집하는 정면·측면·평면·아이소메트릭 단면 보기
- 빈 칸을 저장하지 않는 최대 9,600개 sparse 셀과 4× FURN1 가로 구간 압축
- 로컬 이미지의 픽셀 크기·팔레트·투명도·디더링 참조 미리보기
- 벽·바닥 픽셀 패널, 밝기·알파 부조, 앞·옆·위 실루엣 visual hull 변환
- 이미지 원본·EXIF·로컬 경로를 저장하거나 공유하지 않는 메모리 전용 디코드

## 다음 확장 후보

- 사용자가 고르는 시작 방향·프레임 수와 개별 프레임 파일 묶음
- 팔레트 인덱스 기반 고밀도 텍스처 표면 스키마
- 로컬 프로젝트 파일 불러오기·저장과 여러 가구를 묶는 작업대

## 외부 3D 도구 호환성

외부 도구용 내보내기는 특정 상용 프로그램의 전용 파일을 직접 만들기보다 공개된 중간 형식을 우선한다. FurnitureDefinition은 그대로 정본으로 남고, 아래 파일들은 사용자가 요청할 때 브라우저 메모리에서 만드는 파생 산출물이다.

1. **MagicaVoxel `.vox`**: 복셀 좌표를 가장 직접적으로 보존하는 1차 후보다. 공개된 version 150 구조는 좌표 축마다 1바이트를 쓰고 팔레트 인덱스 1~255를 사용하므로, 축 길이 256 이상 또는 255색을 넘는 가구는 분할·색상 축소 정책을 사용자가 확인해야 한다. MagicaVoxel 프로그램 자체를 포함하거나 재배포하지 않고 공개 포맷 설명만 바탕으로 writer를 독립 구현한다.
2. **glTF 2.0 `.glb`**: Blender, 3ds Max, SketchUp 같은 일반 3D 도구를 잇는 기본 메시 교환 후보다. 같은 색·재료의 맞닿은 복셀 면을 합치는 결정론적 greedy meshing으로 내부 면과 폴리곤 수를 줄이고, 표면색은 unlit 또는 base-color 재료로 보존한다. 축 방향·단위·바닥 기준점과 원본 FURN1 식별자는 `extras`와 동봉 metadata에 기록하되 외부 도구가 이를 보존한다고 가정하지 않는다.
3. **OBJ + MTL + metadata ZIP**: 단순 형상과 색을 넓게 전달하는 보조 형식이다. 텍스트 기반이라 별도 SDK 없이 만들 수 있지만 계층, 애니메이션, 복잡한 재질 보존에는 적합하지 않다.

`.max`, `.skp`, `.fbx`처럼 벤더 전용 SDK·라이선스·버전 의존성이 큰 형식은 브라우저에서 직접 쓰지 않는다. 에이블러(ABLUR)와 스냅툰처럼 공개된 가져오기 사양이 불분명한 도구는 이름만 보고 호환을 약속하지 않고, 실제 지원 포맷과 샘플 파일을 확인한 뒤 위 중간 형식 또는 SketchUp 변환 경로를 문서화한다.

### 라이선스와 구현 후보

- Khronos의 glTF 2.0은 royalty-free 공개 사양이다. 직접 GLB writer를 만들거나, 필요할 때 웹과 Node에서 동작하는 MIT 라이선스의 `@gltf-transform/core`를 사용할 수 있다. 라이브러리를 도입하면 저작권 고지와 라이선스 전문을 `THIRD_PARTY_NOTICES`에 남긴다.
- 3ds Max 2020~2027은 Khronos가 공개한 Apache-2.0 glTF importer/exporter로 GLB 왕복을 검증할 수 있다. 이 플러그인은 선택적 검증 도구일 뿐 사이트에 포함하거나 자동 설치하지 않는다.
- `.vox` writer와 OBJ/MTL writer는 현재 데이터 크기 안에서 충분히 작으므로 우선 자체 구현해 런타임 의존성과 라이선스 표면을 줄인다. MagicaVoxel 프로그램은 무료 사용 조건과 별개로 재배포가 제한되므로 실행 파일이나 코드를 복제·번들링하지 않는다. VOX 포맷 저장소의 라이선스 표기가 명확해지기 전에는 기본 팔레트나 예제 코드를 복사하지 않고, 문서화된 청크 구조에 맞춰 자체 팔레트와 writer를 작성한다.
- 내보낸 GLB는 Khronos glTF Validator와 Blender 왕복으로 검증하고, VOX는 MagicaVoxel 및 최소 하나의 독립 오픈소스 reader로 왕복 검증한다. 프로그램별 호환 표에는 확인한 버전, 축·단위 변환, 재질 손실 여부를 함께 기록한다.

참고 정본: [MagicaVoxel와 배포 조건](https://ephtracy.github.io/), [MagicaVoxel VOX 형식](https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox.txt), [Khronos glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html), [glTF-Transform](https://github.com/donmccurdy/glTF-Transform), [Blender glTF 설명](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html), [3ds Max 오픈소스 glTF importer/exporter](https://www.khronos.org/blog/khronos-sponsors-open-source-gltf-importer-exporter-for-autodesk-3ds-max), [SketchUp GLB 가져오기·내보내기](https://help.sketchup.com/en/sketchup/working-gltf-files).

모든 단계는 로그인·서버 저장·자동 업로드 없이 동작하고, 생성형 이미지 모델을 에셋 파이프라인에 사용하지 않는다.
