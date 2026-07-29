# 데이터 모델 초안

정본 타입은 lib/room/types.ts에 둔다. 방 코드, JSON, Google Sheet 어댑터는 모두 같은 RoomDocument로 변환된다.

정식 방 코드는 ROOM1 접두어, URL-safe 인코딩, 손상 검출, 크기 제한, 스키마 검증을 제공해야 한다. 현재 ROOM1 표본은 시드, 팔레트와 커스텀 가구 배치를 담으며 향후 정식 디코더와 체크섬 검증을 추가한다.

## Google Sheet 최소 구조

rooms 시트: room_id, owner, room_code, visibility, revision, updated_at.

가구 지급이 필요한 커뮤니티만 inventory(owner, item_id, quantity, source)와 catalog(item_id, pack, available_from, available_to, enabled)를 추가한다.

시트는 고빈도 상태 저장소가 아니다. 편집 중 상태는 로컬에 두고 완료된 방 코드만 저장한다.

## FurnitureDefinition과 FURN1

가구 정본 타입은 lib/furniture/types.ts에 둔다. FurnitureDefinition은 배치 면, 1×·2×·4× 조립 해상도, 격자 크기, 재료와 선택적 표면색이 지정된 sparse 조립 셀 목록, schemaVersion, rendererVersion과 출처 메타데이터를 가진다. 표면색은 정규화된 소문자 `#rrggbb`이며, 색이 없는 기존 셀은 재료의 기본색을 사용한다. `placement`가 없는 기존 FURN1은 `volume`, `resolution`이 없는 코드는 1×로 해석한다. `floor`는 z=0 한 겹, `wall`은 y=0 한 겹만 허용한다. 고해상도는 활성 축의 격자 범위를 확장하지만 방 안에서 셀 한 변을 해상도 비율만큼 줄여 외형 크기를 유지한다.

FURN1 코드는 정규화한 UTF-8 JSON을 URL-safe Base64로 인코딩하고 FNV-1a 체크섬을 붙인다. 디코더는 코드 길이, 격자 범위, 조립 칸 수와 좌표, 재료, 표면색, 라이선스, 생성형 이미지 비사용 표시를 검증한다. 공유 링크는 #FURN1... 형식이며 자동 서버 저장을 의미하지 않는다. 최근 색상 이력은 FURN1이나 서버 데이터가 아니라 브라우저 로컬 UI 상태다.

1×·2× 코드는 기존 `voxels` 목록과 호환된다. 4× 코드는 `[x, y, z, length, material, color?]` 가로 구간의 `runs` 목록을 사용하며, 같은 정규화 데이터는 항상 같은 구간 순서와 체크섬을 만든다. 메모리 정본은 어느 경우에도 최대 9,600개의 FurnitureVoxel 목록으로 복원되어 렌더러가 압축 형식을 알 필요가 없다.

화면 확대율과 이동량, 아이소메트릭·정면·측면·평면 보기, 활성 단면과 도구, 호버·선택 영역, 실행 취소·다시 실행 스택도 FURN1 정본 데이터가 아니다. 이 값들은 브라우저 메모리의 편집 세션에만 존재하며 공유 코드의 결정론적 왕복 결과를 바꾸지 않는다. 조립판 크기 변경은 FurnitureDefinition의 `grid`와 범위 안의 `voxels`만 갱신하고, 범위 밖 셀을 되돌리는 스냅샷은 편집 기록에만 둔다.

## 미디어 내보내기 옵션

이미지 크기, 보기 방향, 프레임 시간, 투명·종이 배경, 외곽선·재질 경계, 그림자는 FurnitureDefinition의 정본 데이터가 아니다. 사용자가 내보낼 때 렌더러에 전달하는 일시적 옵션이며 FURN1 왕복 결과와 방 안의 물리 크기를 바꾸지 않는다. 4방향 시트는 0·90·180·270도 프레임을, 8방향 시트·GIF·애니메이션 WebP는 45도 간격 프레임을 같은 정사각형 크기로 사용한다.

외부 도구용 ZIP 묶음의 `metadata.json`은 스키마 식별자, 프레임 크기·수·시간, 방향, 정규화한 바닥 기준점, 배치 종류, 해상도, rendererVersion과 라이선스·제작자 표기를 담는다. `LICENSE.txt`와 FURN1도 별도 파일로 함께 둔다. 이미지 메타데이터는 다른 도구에서 제거될 수 있으므로 권리 정보의 유일한 저장소로 사용하지 않는다.

3D 내보내기 역시 FurnitureDefinition을 바꾸지 않는 파생 작업이다. GLB와 OBJ는 오른손 Y-up·미터 단위·바닥 중앙 기준점을 사용하며 1× 셀 한 변을 0.1m로 고정한다. GLB의 노드 `extras.characterRoomBuilder`에는 FURN1, 배치 종류, 해상도, rendererVersion, 단위·기준점과 권리 정보를 넣는다. OBJ ZIP의 `metadata.json`은 동일한 축·단위·기준점, 메시 범위와 정점·삼각형·재질 수, 권리 정보를 기록하고 MTL·FURN1·LICENSE를 함께 둔다. 이 메타데이터는 외부 프로그램이 제거할 수 있으므로 FURN1과 LICENSE 파일을 별도로 유지한다.

## 픽셀 표면과 다음 스키마

현재 이미지 도트 변환은 메모리의 양자화 결과를 표면색이 있는 기존 FurnitureVoxel로 명시적으로 바꾼다. 따라서 벽·바닥 패널, 밝기·알파 부조와 삼면 실루엣 교집합도 별도 원본이나 EXIF 없이 기존 FURN1 검증·라이선스·9,600셀 상한을 그대로 따른다. 이미지 원본과 변환 설정은 정본에 포함되지 않는다.

향후 이 상한을 넘는 고밀도 표면이 필요하면 `palette`와 팔레트 인덱스 기반 `pixelSurfaces`를 FurnitureDefinition 안의 선택적 표면 데이터로 두고 반복 구간을 압축하는 다음 스키마를 검토한다. 기존 voxel geometry와 분리하되 Room Composer는 둘을 포함한 FurnitureDefinition 전체를 계속 하나의 오브젝트로 소비한다.

## 방의 커스텀 가구

RoomObject의 `type: "furniture"` 변형은 위치 `x`, `y`, 선택적 높이 `z`, 90도 단위 `rotation`, 선택적 벽 방향과 검증된 FurnitureDefinition을 가진다. 방 렌더러는 정의를 하나의 배치 오브젝트로 소비하며 공방 내부 격자를 RoomDocument의 다른 내장 오브젝트로 펼치지 않는다.
