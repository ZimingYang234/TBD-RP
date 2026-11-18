export type PlayerClass = 'Fighter' | 'Wizard' | 'Rogue';

export type Direction = 'up' | 'down' | 'left' | 'right';

export type TileType =
  | 'grass'
  | 'path'
  | 'wall'
  | 'water'
  | 'portal'
  | 'event'
  | 'combat'
  | 'shop'
  | 'chest'
  | 'minigame'
  | 'spring'
  | 'trap'
  | 'secret_question';

export type RegionTheme =
  | 'verdant'
  | 'desert'
  | 'frost'
  | 'astral'
  | 'boss'
  | 'swamp'
  | 'ruins'
  | 'ocean'
  | 'cavern'
  | 'spaceship';

export type ItemRarity = 'comun' | 'raro' | 'epico' | 'legendario';

export type ItemKind = 'consumable' | 'weapon' | 'armor' | 'upgrade';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  rarity: ItemRarity;
  description: string;
  attackBonus?: number;
  defenseBonus?: number;
  hpBonus?: number;
  luckBonus?: number;
}

export interface ChestDef {
  x: number;
  y: number;
  rarity: ItemRarity;
}

export interface PortalDef {
  x: number;
  y: number;
  label: string;
  targetRegionId: string;
  targetX: number;
  targetY: number;
  minLevel?: number;
  requiredKey?: string;
  requiredKeyLabel?: string;
  requiresFinalUnlock?: boolean;
}

export interface BlueCreatureState {
  regionId: string;
  x: number;
  y: number;
}

export interface SecretQuestionState {
  question: string;
  options: [string, string, string];
  correctIndex: number;
  authorName: string;
}

export interface RoamingMonster {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface RegionMap {
  id: string;
  name: string;
  subtitle: string;
  modifierLabel?: string;
  theme: RegionTheme;
  width: number;
  height: number;
  tiles: TileType[][];
  spawn: { x: number; y: number };
  portals: PortalDef[];
  chests: ChestDef[];
}

export type SkillNodeId =
  | 'martial_1'
  | 'martial_2'
  | 'guard_1'
  | 'guard_2'
  | 'focus_1'
  | 'focus_2';

export interface SkillNodeDef {
  id: SkillNodeId;
  branch: 'Marcial' | 'Baluarte' | 'Arcano';
  tier: 1 | 2;
  name: string;
  kind: 'passive' | 'active';
  cost: number;
  requires?: SkillNodeId;
  description: string;
  combatAction?: 'skill_safe' | 'skill_shield' | 'skill_pierce';
}

export interface PlayerState {
  id: string;
  token: string;
  name: string;
  playerClass: PlayerClass;
  x: number;
  y: number;
  regionId: string;
  hp: number;
  maxHp: number;
  ac: number;
  attackMod: number;
  damageDice: string;
  gold: number;
  xp: number;
  level: number;
  skillPoints: number;
  unlockedSkills: SkillNodeId[];
  luckBonus: number;
  inventory: Record<string, number>;
  shopUpgrades?: Record<string, number>;
  equippedWeaponId: string | null;
  equippedArmorId: string | null;
  redeemedCodes: string[];
  tavernPlays?: number[];
  connected: boolean;
}

export type PublicPlayerState = Omit<PlayerState, 'token'>;

export type RoomPhase = 'lobby' | 'playing' | 'event' | 'combat';

export type StatusKind = 'burn' | 'poison' | 'marked' | 'weak';

export interface CombatStatus {
  kind: StatusKind;
  turns: number;
}

export interface CombatEnemy {
  id: string;
  name: string;
  isBoss?: boolean;
  bossPhase?: 1 | 2;
  statuses?: CombatStatus[];
  hp: number;
  maxHp: number;
  ac: number;
  attackMod: number;
  initiativeMod: number;
  damageDice: string;
  xpReward: number;
  goldReward: number;
}

export interface CombatTurnEntry {
  id: string;
  kind: 'player' | 'enemy';
  name: string;
  initiative: number;
  initiativeRoll: number;
}

export interface DiceRollBreakdown {
  actorId: string;
  actorName: string;
  actorKind: 'player' | 'enemy';
  targetId?: string;
  targetName?: string;
  actionType:
    | 'attack'
    | 'luck'
    | 'special'
    | 'skill_safe'
    | 'skill_shield'
    | 'skill_pierce'
    | 'defend'
    | 'potion'
    | 'bomb'
    | 'skip';
  luckOutcome?: 'jackpot' | 'backfire';
  headline?: string;
  d20?: number;
  attackMod?: number;
  attackTotal?: number;
  targetAc?: number;
  hit?: boolean;
  critical?: boolean;
  fumble?: boolean;
  damageDice?: string;
  damageRolls?: number[];
  damageMod?: number;
  damageTotal?: number;
  healAmount?: number;
  summary: string;
}

export interface CombatState {
  id: string;
  mode: 'pve' | 'pvp';
  isBoss?: boolean;
  isBlueCreature?: boolean;
  round: number;
  enemies: CombatEnemy[];
  turnOrder: CombatTurnEntry[];
  turnIndex: number;
  defendingIds: string[];
  potionsLeftByPlayer: Record<string, number>;
  specialUsedByPlayer: Record<string, boolean>;
  unlockedSpecialsUsedByPlayer?: Record<string, string[]>;
  playerStatuses?: Record<string, CombatStatus[]>;
  lastRoll: DiceRollBreakdown | null;
  log: string[];
}

export interface QuestState {
  id: string;
  title: string;
  type: 'combat' | 'portal' | 'event';
  progress: number;
  target: number;
  rewardGold: number;
  rewardXp: number;
}

export interface TavernResultPayload {
  die1: number;
  die2: number;
  total: number;
  bet: number;
  payout: number;
  net: number;
  headline: string;
  summary: string;
  room: PublicRoomState;
}

export interface CombatEndedPayload {
  victory: boolean;
  summary: string;
  xpGained: number;
  goldGained: number;
  room: PublicRoomState;
}

export interface PublicEventChoice {
  id: string;
  label: string;
}

export type EventTriggerType = 'event' | 'portal';
export type EventSource = 'ai' | 'cache' | 'fallback';

export interface ActiveEventState {
  id: string;
  title: string;
  narration: string;
  choices: PublicEventChoice[];
  votes: Record<string, string>;
  triggeredByName: string;
  triggerType: EventTriggerType;
  source: EventSource;
  startedAt: number;
}

export interface EventEffectsSummary {
  hpDelta?: number;
  xpDelta?: number;
  goldDelta?: number;
  summary: string;
}

export interface EventOutcomePayload {
  eventTitle: string;
  winningChoiceLabel: string;
  outcomeNarration: string;
  effects: EventEffectsSummary;
  room: PublicRoomState;
}

export interface PublicRoomState {
  code: string;
  hostId: string;
  phase: RoomPhase;
  regionId: string;
  players: PublicPlayerState[];
  map: RegionMap;
  activeEvent: ActiveEventState | null;
  combat: CombatState | null;
  quest: QuestState | null;
  bossKeys: string[];
  roamingMonsters?: RoamingMonster[];
  blueCreature?: BlueCreatureState | null;
  secretRoomUnlocked?: boolean;
}

export interface JoinSuccessPayload {
  room: PublicRoomState;
  playerId: string;
  playerToken: string;
}

export interface CreateRoomPayload {
  playerName: string;
  playerClass: PlayerClass;
}

export interface JoinRoomPayload {
  roomCode: string;
  playerName: string;
  playerClass: PlayerClass;
  playerToken?: string;
}

export interface ReconnectRoomPayload {
  roomCode: string;
  playerToken: string;
}

export interface MovePayload {
  direction: Direction;
}

export interface PartyTeleportedPayload {
  room: PublicRoomState;
  fromRegionName: string;
  toRegionName: string;
  triggeredByName: string;
}

export interface ServerToClientEvents {
  room_joined: (payload: JoinSuccessPayload) => void;
  room_state: (room: PublicRoomState) => void;
  player_moved: (payload: { playerId: string; x: number; y: number; regionId: string }) => void;
  roaming_moved: (monsters: RoamingMonster[]) => void;
  blue_creature_moved: (creature: BlueCreatureState | null) => void;
  party_teleported: (payload: PartyTeleportedPayload) => void;
  event_started: (payload: { room: PublicRoomState }) => void;
  event_updated: (payload: { activeEvent: ActiveEventState }) => void;
  event_resolved: (payload: EventOutcomePayload) => void;
  combat_started: (payload: { room: PublicRoomState }) => void;
  combat_updated: (payload: { room: PublicRoomState; roll: DiceRollBreakdown }) => void;
  enemy_telegraph: (payload: {
    enemyName: string;
    targetPlayerId: string;
    targetPlayerName: string;
    windowMs: number;
  }) => void;
  combat_ended: (payload: CombatEndedPayload) => void;
  tavern_result: (payload: TavernResultPayload) => void;
  chest_opened: (payload: {
    playerId: string;
    playerName: string;
    rarity: ItemRarity;
    gold: number;
    xp: number;
    itemId?: string;
    itemName?: string;
    inventoryFull?: boolean;
    room: PublicRoomState;
  }) => void;
  open_shop: () => void;
  open_minigame: (payload: { game: 'memory' | 'reflex' | 'chest_guess' | 'riddle' | 'arena' }) => void;
  open_secret_question: (payload: SecretQuestionState) => void;
  secret_question_result: (payload: { correct: boolean; message: string; canCustomize: boolean }) => void;
  open_secret_portal_reqs: (payload: {
    hasFinalKey: boolean;
    hasBlueEssence: boolean;
    hasCoins: boolean;
    coins: number;
  }) => void;
  save_code_generated: (payload: { saveCode: string }) => void;
  room_error: (payload: { message: string; code?: string }) => void;
  system_notice: (payload: { message: string }) => void;
}

export interface ClientToServerEvents {
  create_room: (payload: CreateRoomPayload) => void;
  join_room: (payload: JoinRoomPayload) => void;
  reconnect_room: (payload: ReconnectRoomPayload) => void;
  leave_room: () => void;
  start_game: () => void;
  player_move: (payload: MovePayload) => void;
  vote_event: (payload: { choiceId: string }) => void;
  resolve_event_now: () => void;
  start_combat_encounter: () => void;
  start_boss_fight: () => void;
  start_pvp_duel: () => void;
  combat_action: (payload: {
    action:
      | 'attack'
      | 'luck'
      | 'special'
      | 'skill_safe'
      | 'skill_shield'
      | 'skill_pierce'
      | 'defend'
      | 'potion'
      | 'bomb';
    targetId?: string;
    qteScore?: number;
  }) => void;
  combat_dodge: (payload: { quality: 'perfect' | 'medium' | 'bad' }) => void;
  complete_boss_arena: (payload: { victory: boolean; regionId: string }) => void;
  skip_combat_turn: () => void;
  play_tavern_dice: (payload: { bet: number }) => void;
  buy_item: (payload: { itemId: string }) => void;
  use_item: (payload: { itemId: string }) => void;
  equip_item: (payload: { itemId: string }) => void;
  unequip_item: (payload: { slot: 'weapon' | 'armor' }) => void;
  drop_item: (payload: { itemId: string }) => void;
  give_item: (payload: { itemId: string; targetPlayerId: string }) => void;
  unlock_skill: (payload: { skillId: SkillNodeId }) => void;
  redeem_code: (payload: { code: string }) => void;
  export_save_code: () => void;
  load_save_code: (payload: { saveCode: string }) => void;
  reset_progress: () => void;
  answer_secret_question: (payload: { choiceIndex: number }) => void;
  set_secret_question: (payload: {
    question: string;
    options: [string, string, string];
    correctIndex: number;
  }) => void;
  complete_minigame: (payload: {
    game: 'memory' | 'reflex' | 'chest_guess' | 'riddle' | 'arena';
    difficulty: 'normal' | 'dificil';
    score: number;
  }) => void;
}
