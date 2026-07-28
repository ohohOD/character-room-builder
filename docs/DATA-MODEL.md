# 데이터 모델 초안

정본 타입은 lib/room/types.ts에 둔다. 방 코드, JSON, Google Sheet 어댑터는 모두 같은 RoomDocument로 변환된다.

정식 방 코드는 ROOM1 접두어, URL-safe 인코딩, 손상 검출, 크기 제한, 스키마 검증을 제공해야 한다. 현재 프로토타입 코드는 시드와 팔레트만 담는 임시 표본이다.

## Google Sheet 최소 구조

rooms 시트: room_id, owner, room_code, visibility, revision, updated_at.

가구 지급이 필요한 커뮤니티만 inventory(owner, item_id, quantity, source)와 catalog(item_id, pack, available_from, available_to, enabled)를 추가한다.

시트는 고빈도 상태 저장소가 아니다. 편집 중 상태는 로컬에 두고 완료된 방 코드만 저장한다.

## FurnitureDefinition과 FURN1

가구 정본 타입은 lib/furniture/types.ts에 둔다. FurnitureDefinition은 배치 면, 격자 크기, 재료와 선택적 표면색이 지정된 조립 셀 목록, schemaVersion, rendererVersion과 출처 메타데이터를 가진다. 표면색은 정규화된 소문자 `#rrggbb`이며, 색이 없는 기존 셀은 재료의 기본색을 사용한다. `placement`가 없는 기존 FURN1은 `volume`으로 해석한다. `floor`는 z=0 한 겹, `wall`은 y=0 한 겹만 허용한다.

FURN1 코드는 정규화한 UTF-8 JSON을 URL-safe Base64로 인코딩하고 FNV-1a 체크섬을 붙인다. 디코더는 코드 길이, 격자 범위, 조립 칸 수와 좌표, 재료, 표면색, 라이선스, 생성형 이미지 비사용 표시를 검증한다. 공유 링크는 #FURN1... 형식이며 자동 서버 저장을 의미하지 않는다. 최근 색상 이력은 FURN1이나 서버 데이터가 아니라 브라우저 로컬 UI 상태다.
