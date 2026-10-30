export type Pose = { x: number; z: number; rotation: number; location: string; speed: number; mode: string };
export type Player = { characterId: string; name: string; pose: Pose | null };
export type Message = { id: string; senderId: string; senderName: string; text: string; sequence: number; sentAt: string; clientMessageId: string };
export type RoomState = { status: string; code: string; selfId: string; players: Player[]; messages: Message[]; error: string };
export function emptyRoom(): RoomState;
export function normalizeCode(code: string): string;
export function mergeMessage(messages: Message[], message: Message): Message[];
export type RoomClient = { read(): RoomState; create(): Promise<void>; join(code: string): Promise<void>; send(text: string, clientMessageId?: string): Promise<void>; publish(pose: Pose): void; leave(): Promise<void>; dispose(): void };
export function createRoomClient(options: { connect: () => Promise<any>; changed?: (state: RoomState) => void; now?: () => number; uuid?: () => string }): RoomClient;
