/**
 * 채널 매핑 서비스
 *
 * Logger Storage 폴더명 ↔ 화면 표시명 ↔ 공유 NAS 폴더명 매핑 관리.
 * 수정 시 변경된 필드만 channel_mapping_histories에 자동 기록한다.
 *
 * 삭제 기능 없음 - is_active=0으로 비활성화만 가능.
 * (이력 보존 및 기존 요청 참조 무결성 유지)
 */
import db from '../../config/database';

// 채널 매핑 DB 행 타입
export interface ChannelMapping {
  id: number;
  storage_folder: string;
  display_name: string;
  nas_folder: string;
  description: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

// 채널 변경 이력 DB 행 타입
export interface ChannelMappingHistory {
  id: number;
  channel_mapping_id: number;
  changed_by: number;
  changed_by_name: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

// 채널 추가 요청 타입
export interface CreateChannelDto {
  storage_folder: string;
  display_name: string;
  nas_folder: string;
  description?: string;
}

// 채널 수정 요청 타입 (모든 필드 선택적)
export interface UpdateChannelDto {
  storage_folder?: string;
  display_name?: string;
  nas_folder?: string;
  description?: string;
  is_active?: number;
}

/**
 * 채널 목록 조회
 *
 * @param includeInactive true이면 비활성 채널 포함, false이면 활성만 반환
 */
export function getChannels(includeInactive = false): ChannelMapping[] {
  const sql = includeInactive
    ? 'SELECT * FROM channel_mappings ORDER BY storage_folder ASC'
    : 'SELECT * FROM channel_mappings WHERE is_active = 1 ORDER BY storage_folder ASC';

  return db.prepare(sql).all() as ChannelMapping[];
}

/**
 * 단일 채널 조회
 *
 * @param id 채널 ID
 */
export function getChannelById(id: number): ChannelMapping | null {
  return (
    (db.prepare('SELECT * FROM channel_mappings WHERE id = ?').get(id) as ChannelMapping | undefined) ??
    null
  );
}

/**
 * 채널 추가
 *
 * storage_folder 중복 시 DB UNIQUE 제약으로 예외 발생 → 호출자에서 처리
 *
 * @param dto 채널 정보
 */
export function createChannel(dto: CreateChannelDto): ChannelMapping {
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO channel_mappings (storage_folder, display_name, nas_folder, description, is_active, created_at, updated_at)
    VALUES (@storage_folder, @display_name, @nas_folder, @description, 1, @now, @now)
  `).run({
    storage_folder: dto.storage_folder.trim(),
    display_name: dto.display_name.trim(),
    nas_folder: dto.nas_folder.trim(),
    description: dto.description?.trim() ?? null,
    now,
  });

  return getChannelById(result.lastInsertRowid as number) as ChannelMapping;
}

/**
 * 채널 수정
 *
 * 변경된 필드만 감지하여 channel_mapping_histories에 기록한다.
 * storage_folder 변경 시에도 이력이 남는다 (파일 탐색 영향 주의).
 *
 * @param id 채널 ID
 * @param dto 수정할 필드
 * @param changedByUserId 수정을 수행한 관리자 ID
 */
export function updateChannel(
  id: number,
  dto: UpdateChannelDto,
  changedByUserId: number,
): ChannelMapping | null {
  const existing = getChannelById(id);
  if (!existing) {
    return null;
  }

  const now = new Date().toISOString();

  // 변경 감지: 제출된 필드 중 실제로 달라진 것만 추적
  const trackableFields: (keyof UpdateChannelDto)[] = [
    'storage_folder',
    'display_name',
    'nas_folder',
    'description',
    'is_active',
  ];

  const historyInsert = db.prepare(`
    INSERT INTO channel_mapping_histories
      (channel_mapping_id, changed_by, field_name, old_value, new_value, changed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // 트랜잭션으로 수정 + 이력 기록을 원자적으로 처리
  const updateAndRecord = db.transaction(() => {
    for (const field of trackableFields) {
      if (!(field in dto)) continue;

      const oldVal = String(existing[field as keyof ChannelMapping] ?? '');
      const newVal = String(dto[field] ?? '');

      // 값이 실제로 변경된 경우에만 이력 기록
      if (oldVal !== newVal) {
        historyInsert.run(
          id,
          changedByUserId,
          field,
          oldVal === 'null' ? null : oldVal,
          newVal === 'null' ? null : newVal,
          now,
          now,
        );
      }
    }

    // 실제 업데이트 실행
    db.prepare(`
      UPDATE channel_mappings
      SET
        storage_folder = COALESCE(@storage_folder, storage_folder),
        display_name   = COALESCE(@display_name, display_name),
        nas_folder     = COALESCE(@nas_folder, nas_folder),
        description    = CASE WHEN @has_description = 1 THEN @description ELSE description END,
        is_active      = COALESCE(@is_active, is_active),
        updated_at     = @now
      WHERE id = @id
    `).run({
      storage_folder: dto.storage_folder?.trim() ?? null,
      display_name: dto.display_name?.trim() ?? null,
      nas_folder: dto.nas_folder?.trim() ?? null,
      description: 'description' in dto ? (dto.description?.trim() ?? null) : null,
      has_description: 'description' in dto ? 1 : 0,
      is_active: dto.is_active ?? null,
      now,
      id,
    });
  });

  updateAndRecord();

  return getChannelById(id);
}

/**
 * 채널 변경 이력 조회
 *
 * @param channelId 채널 ID
 * @param limit 최대 조회 건수 (기본 20)
 * @param offset 오프셋 (페이지네이션)
 */
export function getChannelHistories(
  channelId: number,
  limit = 20,
  offset = 0,
): ChannelMappingHistory[] {
  return db.prepare(`
    SELECT
      h.id,
      h.channel_mapping_id,
      h.changed_by,
      u.display_name AS changed_by_name,
      h.field_name,
      h.old_value,
      h.new_value,
      h.changed_at
    FROM channel_mapping_histories h
    LEFT JOIN users u ON u.id = h.changed_by
    WHERE h.channel_mapping_id = ?
    ORDER BY h.changed_at DESC
    LIMIT ? OFFSET ?
  `).all(channelId, limit, offset) as ChannelMappingHistory[];
}
