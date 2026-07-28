# 데이터 모델 초안

정본 타입은 lib/room/types.ts에 둔다. 방 코드, JSON, Google Sheet 어댑터는 모두 같은 RoomDocument로 변환된다.

정식 방 코드는 ROOM1 접두어, URL-safe 인코딩, 손상 검출, 크기 제한, 스키마 검증을 제공해야 한다. 현재 ROOM1 표본은 시드, 팔레트와 커스텀 가구 배치를 담으며 향후 정식 디코더와 체크섬 검증을 추가한다.

## Google Sheet 최소 구조

rooms 시트: room_id, owner, room_code, visibility, revision, updated_at.

가구 지급이 필요한 커뮤니티만 inventory(owner, item_id, quantity, source)와 catalog(item_id, pack, available_from, available_to, enabled)를 추가한다.

시트는 고빈도 상태 저장소가 아니다. 편집 중 상태는 로컬에 두고 완료된 방 코드만 저장한다.

## FurnitureDefinition과 FURN1

가구 정본 타입은 lib/furniture/types.ts에 둔다. FurnitureDefinition은 배치 면, 조립 해상도, 격자 크기, 재료와 선택적 표면색이 지정된 조립 셀 목록, schemaVersion, rendererVersion과 출처 메타데이터를 가진다. 표면색은 정규화된 소문자 `#rrggbb`이며, 색이 없는 기존 셀은 재료의 기본색을 사용한다. `placement`가 없는 기존 FURN1은 `volume`, `resolution`이 없는 코드는 1×로 해석한다. `floor`는 z=0 한 겹, `wall`은 y=0 한 겹만 허용한다. 2×는 활성 축의 격자 범위와 셀 수 제한을 확장하지만 방 안에서 셀 한 변을 절반으로 렌더링해 외형 크기를 유지한다.

FURN1 코드는 정규화한 UTF-8 JSON을 URL-safe Base64로 인코딩하고 FNV-1a 체크섬을 붙인다. 디코더는 코드 길이, 격자 범위, 조립 칸 수와 좌표, 재료, 표면색, 라이선스, 생성형 이미지 비사용 표시를 검증한다. 공유 링크는 #FURN1... 형식이며 자동 서버 저장을 의미하지 않는다. 최근 색상 이력은 FURN1이나 서버 데이터가 아니라 브라우저 로컬 UI 상태다.

## 미디어 내보내기 옵션

이미지 크기, 보기 방향, 투명·종이 배경, 외곽선·재질 경계, 그림자는 FurnitureDefinition의 정본 데이터가 아니다. 사용자가 내보낼 때 렌더러에 전달하는 일시적 옵션이며 FURN1 왕복 결과와 방 안의 물리 크기를 바꾸지 않는다. 첫 스프라이트 시트는 0·90·180·270도 네 프레임을 같은 정사각형 크기로 가로 배치한다.

향후 외부 도구용 내보내기 묶음은 프레임 크기, 방향, 바닥 기준점과 라이선스를 JSON·LICENSE 보조 파일에 담을 수 있다. 이미지 메타데이터는 다른 도구에서 제거될 수 있으므로 권리 정보의 유일한 저장소로 사용하지 않는다.

## 픽셀 표면과 다음 스키마

이미지 도트 변환 결과를 수천 개의 개별 RGB 복셀로만 저장하면 FURN1 크기 제한을 빠르게 소모한다. 다음 스키마는 `palette`와 팔레트 인덱스 기반 `pixelSurfaces`를 FurnitureDefinition 안의 선택적 표면 데이터로 두고 반복 구간을 압축하는 방향을 검토한다. 기존 voxel geometry와 분리하되 Room Composer는 둘을 포함한 FurnitureDefinition 전체를 계속 하나의 오브젝트로 소비한다.

## 방의 커스텀 가구

RoomObject의 `type: "furniture"` 변형은 위치 `x`, `y`, 선택적 높이 `z`, 90도 단위 `rotation`, 선택적 벽 방향과 검증된 FurnitureDefinition을 가진다. 방 렌더러는 정의를 하나의 배치 오브젝트로 소비하며 공방 내부 격자를 RoomDocument의 다른 내장 오브젝트로 펼치지 않는다.
