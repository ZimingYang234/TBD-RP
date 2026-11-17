export type PlayerClass = 'Fighter' | 'Wizard' | 'Rogue';

export type Direction = 'up' | 'down' | 'left' | 'right';

export type TileType = 'grass' | 'path' | 'wall' | 'water' | 'portal' | 'event' | 'combat' | 'shop';

export type RegionTheme = 'verdant' | 'desert' | 'frost' | 'astral';

export interface PortalDef {
  x: number;
  y: number;
  label: string;
  targetRegionId: string;
  targetX: number;
  targetY: number;
}

export interface RegionMap {
  id: string;
  name: string;
  subtitle: string;
  theme: RegionTheme;
  width: number;
  height: number;
  tiles: TileType[][];
  spawn: { x: number; y: number };
  portals: PortalDef[];
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
  luckBonus: number;
  inventory: Record<string, number>;
  redeemedCodes: string[];
  connected: boolean;
}

export type PublicPlayerState = Omit<PlayerState, 'token'>;

export type RoomPhase = 'lobby' | 'playing' | 'event' | 'combat';

export interface CombatEnemy {
  id: string;
  name: string;
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
  actionType: 'attack' | 'luck' | 'defend' | 'potion' | 'bomb' | 'skip';
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
  round: number;
  enemies: CombatEnemy[];
  turnOrder: CombatTurnEntry[];
  turnIndex: number;
  defendingIds: string[];
  potionsLeftByPlayer: Record<string, number>;
  lastRoll: DiceRollBreakdown | null;
  log: string[];
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
  party_teleported: (payload: PartyTeleportedPayload) => void;
  event_started: (payload: { room: PublicRoomState }) => void;
  event_updated: (payload: { activeEvent: ActiveEventState }) => void;
  event_resolved: (payload: EventOutcomePayload) => void;
  combat_started: (payload: { room: PublicRoomState }) => void;
  combat_updated: (payload: { room: PublicRoomState; roll: DiceRollBreakdown }) => void;
  combat_ended: (payload: CombatEndedPayload) => void;
  open_shop: () => void;
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
  start_pvp_duel: () => void;
  combat_action: (payload: { action: 'attack' | 'luck' | 'defend' | 'potion' | 'bomb'; targetId?: string }) => void;
  skip_combat_turn: () => void;
  buy_item: (payload: { itemId: string }) => void;
  use_item: (payload: { itemId: string }) => void;
  redeem_code: (payload: { code: string }) => void;
}
