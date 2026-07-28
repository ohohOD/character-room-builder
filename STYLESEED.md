# Character Room Builder — Design Lock

이 파일은 프로젝트의 시각 결정 정본이다. UI를 수정하기 전에 다시 읽고, 선택을 바꾸면 파일과 구현을 함께 갱신한다.

## 제품 성격

- App domain: creative-tools · community character rooms
- Surface: desktop-web · mobile responsive
- Product shell: calm · editorial · tactile
- Result stage: expressive · theme-driven
- Mood: warm · soft · airy · quietly playful

## 잠긴 선택

- Base surfaces: warm paper #F3EFE6 · warm white #FBFAF6
- Key accent: garden sage #557A4F
- Text ramp: ink #302C27 · muted #756D63 · pure black 금지
- Font: system Korean sans body · Georgia serif display
- Radius personality: quiet-soft · stage 8px · controls 4px
- Elevation: 제품 셸은 hairline only · Canvas 방 내부는 조명과 투영 그림자 허용
- Spacing: 8px 계열
- Motion: minimal · 직접 조작 피드백만 · reduced-motion에서 정적
- Focal point: 완성 예시가 열린 아이소메트릭 공방과 투명 결과 미리보기
- Signature move: 이중 괘선 제품 셸 + 절차적 종이 인형극 방
- Icon language: 장식 아이콘 없음 · 기능 아이콘이 필요하면 단일 outline 세트

## 셸과 결과물 경계

- 셸은 웜 페이퍼·잉크·세이지 한 가지 액센트를 유지한다.
- 방 스타일 팩은 벽·바닥·가구·빛의 색과 재질을 바꿀 수 있다.
- 스타일 팩은 컨트롤의 위치, 포커스 표시, 텍스트 대비를 바꾸지 않는다.

## 카피

- 담백하고 구체적으로 설명한다.
- 생성형 이미지 비사용과 데이터 경계는 겁주지 않고 사실로 말한다.
- 버튼은 행동을 직접 말한다.
- 실용 문구에서 과장된 히어로 카피와 장식적 엠대시를 피한다.

## 금지 목록

- 외부 이미지·생성형 이미지·출처 불명 텍스처
- 목적 없는 이모지와 장식 아이콘
- 동일한 아이콘 칩 카드 반복
- 제품 셸의 다중 액센트와 대면적 그라데이션
- 모든 요소에 보더와 그림자를 함께 적용
- 동일한 무게의 균일 카드 그리드
- 빈 편집기를 첫 화면의 주인공으로 두기 · 기본 진입은 완성 프리셋

## 접근성과 상태

- 모든 입력은 명시적 label을 가진다.
- 키보드 포커스는 2px 세이지 링으로 표시한다.
- 상태 변화는 aria-live로 알린다.
- 터치 조작은 최소 44px 높이를 확보한다.
- 모바일에서도 공방 작업물과 결과 미리보기가 초점으로 남는다.
- 애니메이션 없이도 정보와 기능이 완전해야 한다.

## 공개 전 시각 게이트

- [ ] 실제 렌더링을 확인했다.
- [ ] 한눈에 방이 초점으로 보인다.
- [ ] 셸보다 방이 더 표현적이다.
- [ ] 한글과 긴 텍스트가 깨지지 않는다.
- [ ] 모바일·키보드·reduced motion을 확인했다.
- [ ] 외부·생성형 이미지가 포함되지 않았다.
