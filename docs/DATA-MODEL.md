# 데이터 모델 초안

정본 타입은 lib/room/types.ts에 둔다. 방 코드, JSON, Google Sheet 어댑터는 모두 같은 RoomDocument로 변환된다.

정식 방 코드는 ROOM1 접두어, URL-safe 인코딩, 손상 검출, 크기 제한, 스키마 검증을 제공해야 한다. 현재 프로토타입 코드는 시드와 팔레트만 담는 임시 표본이다.

## Google Sheet 최소 구조

rooms 시트: room_id, owner, room_code, visibility, revision, updated_at.

가구 지급이 필요한 커뮤니티만 inventory(owner, item_id, quantity, source)와 catalog(item_id, pack, available_from, available_to, enabled)를 추가한다.

시트는 고빈도 상태 저장소가 아니다. 편집 중 상태는 로컬에 두고 완료된 방 코드만 저장한다.
