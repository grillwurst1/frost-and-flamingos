/**
 * Typed data model of the immutable Fjord Fiesta blueprint.
 *
 * Everything here is plain data. The server builds its Rapier colliders from
 * it, the client derives every visual from it, and later milestones (towers,
 * vehicles, destruction, weather) read the same ids, transforms and routes.
 * Coordinates: X = east, Z = north, Y = up. `rotationY` follows the shared
 * convention where local +Z points along `(sin rotationY, cos rotationY)`.
 */
import type { TranslationKey } from '../i18n/schema.js';
import type { Faction, Vec2, Vec3 } from './index.js';

/** Surface tags drive footsteps, traction and later terrain destruction. */
export type SurfaceTag =
  | 'water'
  | 'sand'
  | 'grass_mud'
  | 'cobblestone'
  | 'snow'
  | 'ice_patch'
  | 'rock_cliff'
  | 'wood';

export type TowerId = 'tower_a' | 'tower_b' | 'tower_c';

export type ZoneId =
  | 'harbor'
  | 'village'
  | 'summit'
  | 'lagoon_base'
  | 'alpine_base'
  | 'gorge'
  | 'bridge'
  | 'palm_point'
  | 'coconut_bay'
  | 'fjord'
  | 'fir_woods'
  | 'glacier'
  | 'crags'
  | 'gasthof'
  | 'bistro'
  | 'tiki_alm'
  | 'highlands'
  | 'shoreline';

/** Climate band used by ambience, weather and footstep flavour. */
export type ClimateBand = 'lagoon' | 'village' | 'alpine';

export interface MapZone {
  readonly id: ZoneId;
  readonly center: Vec2;
  readonly radius: number;
  /** Higher priority zones (buildings, the bridge) win over broad regions. */
  readonly priority: number;
  readonly climate: ClimateBand;
  readonly labelKey: TranslationKey;
}

export type PropCollider =
  | {
      readonly type: 'box';
      readonly halfExtents: Vec3;
      readonly offset: Vec3;
      /** Extra local rotation applied after the prop yaw (yaw → pitch → roll). */
      readonly rotation?: Vec3;
      readonly surface?: SurfaceTag;
      /** Destructible piece this collider belongs to (bridge segment, building). */
      readonly pieceId?: string;
    }
  | {
      readonly type: 'cylinder';
      readonly halfHeight: number;
      readonly radius: number;
      readonly offset: Vec3;
      readonly surface?: SurfaceTag;
      readonly pieceId?: string;
    }
  | {
      readonly type: 'sphere';
      readonly radius: number;
      readonly offset: Vec3;
      readonly surface?: SurfaceTag;
      readonly pieceId?: string;
    }
  | {
      /** Regular polygon prism (octagonal harbour platform, pavilion plinths). */
      readonly type: 'prism';
      readonly sides: number;
      readonly radius: number;
      readonly halfHeight: number;
      readonly offset: Vec3;
      readonly surface?: SurfaceTag;
      readonly pieceId?: string;
    };

export type MapPropKind =
  // Enterable buildings and landmarks
  | 'chalet'
  | 'beach_bar'
  | 'fisher_hut'
  | 'side_hut'
  | 'summit_dairy'
  | 'lighthouse'
  | 'clock_pavilion'
  | 'hangar'
  | 'bamboo_garage'
  | 'cable_station'
  | 'cable_pylon'
  | 'tbar_station'
  | 'tbar_pylon'
  | 'coaster_platform'
  | 'stone_arch'
  // Decks, bridges and piers
  | 'harbor_platform'
  | 'pier'
  | 'bridge_deck'
  | 'bridge_pylon'
  | 'boat_dock'
  | 'walkway'
  | 'stairs'
  | 'ladder'
  // Village dressing
  | 'stone_wall'
  | 'crate_stack'
  | 'barrel'
  | 'billboard'
  | 'bench'
  | 'lantern'
  | 'signpost'
  | 'fence'
  | 'bunting'
  | 'flower_cart'
  | 'well'
  | 'hay_bale'
  | 'snowman'
  | 'ski_rack'
  | 'sled'
  | 'woodpile'
  | 'cheese_silo'
  | 'coconut_silo'
  | 'flamingo_statue'
  | 'hammock'
  | 'umbrella'
  | 'deck_chair'
  | 'tiki_torch'
  | 'surfboard_rack'
  | 'life_ring'
  | 'rowboat_mooring'
  | 'buoy'
  | 'runway_marker'
  | 'spawn_pad'
  | 'flag'
  | 'ice_rink'
  | 'campfire'
  | 'tent'
  | 'snow_cannon_stand'
  // Nature
  | 'fir'
  | 'palm'
  | 'rock'
  | 'bush'
  | 'fern'
  | 'flowers'
  | 'waterfall';

/** A door or window cut-out in a building wall, along the wall's local axis. */
export interface WallOpening {
  /** Which wall of the floor: +Z front, −Z back, +X right, −X left. */
  readonly wall: 'front' | 'back' | 'left' | 'right';
  /** Centre offset along the wall, metres from the wall centre. */
  readonly offset: number;
  readonly width: number;
  readonly height: number;
  /** Sill height above the floor (0 for doors). */
  readonly sill: number;
  /** Doors and counters are open in the collider; windows and slits are glazed/solid. */
  readonly kind: 'door' | 'window' | 'slit' | 'counter';
}

/** Straight interior or exterior stair flight, stored in building-local space. */
export interface StairFlight {
  readonly from: Vec3;
  readonly to: Vec3;
  readonly width: number;
}

export interface BuildingFloor {
  /** Floor top, metres above the building anchor. */
  readonly elevation: number;
  /** Clear wall height of this storey. */
  readonly height: number;
  readonly openings: readonly WallOpening[];
}

export type BuildingStyle =
  | 'log_chalet'
  | 'plaster_chalet'
  | 'tiki_chalet'
  | 'beach_bar'
  | 'fisher_hut'
  | 'side_hut'
  | 'dairy_fortress'
  | 'hangar'
  | 'bamboo_garage'
  | 'station';

/**
 * Parametric building shell. The shared collider generator and the client
 * mesh generator both consume this, so doors in the walls and gaps in the
 * colliders are guaranteed to match.
 */
export interface BuildingLayout {
  readonly style: BuildingStyle;
  readonly width: number;
  readonly depth: number;
  readonly wallThickness: number;
  readonly plinth: number;
  readonly floors: readonly BuildingFloor[];
  /** Stair flights in building-local space (feet positions). */
  readonly stairs: readonly StairFlight[];
  /** Holes in upper floors for stairwells, local XZ rectangles. */
  readonly stairwells: readonly { readonly center: Vec2; readonly size: Vec2 }[];
  readonly balcony?: {
    readonly floor: number;
    readonly depth: number;
    readonly sides: readonly ('front' | 'back' | 'left' | 'right')[];
    readonly railHeight: number;
  };
  readonly roof: {
    /** Pitched roofs are gables (thatch is a material of the building style, not a shape). */
    readonly kind: 'gable' | 'flat' | 'barrel';
    readonly pitch: number;
    readonly overhang: number;
    readonly snow: boolean;
  };
  readonly nameKey?: TranslationKey;
}

export interface MapProp {
  readonly id: string;
  readonly kind: MapPropKind;
  /** Anchor in world space: ground or deck level of the prop. */
  readonly position: Vec3;
  readonly rotationY: number;
  readonly scale: number;
  readonly variant: number;
  readonly dimensions?: Vec3;
  readonly building?: BuildingLayout;
  /** Polyline-shaped props (fences, walls, bunting, walkways) in world space. */
  readonly path?: readonly Vec3[];
  readonly colliders: readonly PropCollider[];
  /** Set when this prop is (part of) a destructible element. */
  readonly destructibleId?: string;
  readonly surface?: SurfaceTag;
}

export interface SpawnPoint {
  readonly id: string;
  readonly position: Vec3;
  readonly rotationY: number;
  readonly zone: ZoneId;
  readonly faction: Faction;
  /** Tower pads are eligible while their team holds the tower; base pads are the fallback. */
  readonly source: TowerId | 'base';
}

/** Named anchor for team-held tower dressing (statues, bunting, snow cannon, icicles). */
export interface TowerAttachPoint {
  readonly id:
    | 'dome_top'
    | 'gallery_ring'
    | 'platform_ring'
    | 'roof_peak'
    | 'roof_ridge'
    | 'fountain_basin'
    | 'clock_face'
    | 'terrace'
    | 'balcony_ring';
  readonly position: Vec3;
  readonly rotationY: number;
  /** Ring radius for circular attach points (gallery, basin, platform). */
  readonly radius?: number;
}

export interface TowerDefinition {
  readonly id: TowerId;
  readonly labelKey: TranslationKey;
  readonly position: Vec3;
  readonly captureRadius: number;
  /** Tower whose ownership a faction holds at round start. */
  readonly homeFaction: Faction | null;
  readonly spawnPads: readonly SpawnPoint[];
  readonly zone: ZoneId;
  readonly attachPoints: readonly TowerAttachPoint[];
}

export interface FactionBase {
  readonly faction: Faction;
  readonly labelKey: TranslationKey;
  readonly position: Vec3;
  readonly protectedRadius: number;
  readonly spawnPads: readonly SpawnPoint[];
}

export type VehicleKind =
  | 'badi_flamingo'
  | 'fondue_crawler'
  | 'coconut_tank'
  | 'rowboat'
  | 'sidecar'
  | 'biplane'
  | 'cable_car';

export interface VehicleSpawnPoint {
  readonly id: string;
  readonly vehicle: VehicleKind;
  readonly position: Vec3;
  readonly rotationY: number;
  /** Owning faction, or null for neutral map vehicles. */
  readonly faction: Faction | null;
  /** `capture` spawns only appear while the given tower is held. */
  readonly trigger: 'base' | 'map' | { readonly capture: TowerId };
}

/** A polyline route sampled densely enough to move objects along it exactly. */
export interface RoutePolyline {
  readonly id: string;
  readonly points: readonly Vec3[];
  /** Cumulative arc length per point (same length as `points`). */
  readonly distances: readonly number[];
  readonly length: number;
}

export interface RoadRoute extends RoutePolyline {
  readonly width: number;
  readonly surface: SurfaceTag;
}

export interface CableCarStation {
  readonly id: 'valley' | 'mid' | 'mountain';
  readonly labelKey: TranslationKey;
  /** Boarding platform floor. */
  readonly platform: Vec3;
  /** Emergency brake pedestal origin on the platform. */
  readonly brakeBase: Vec3;
  /** Released handle grip, used for interaction and hitscan (`F`). */
  readonly brakeLever: Vec3;
  /** Arc length of the gondola path at this station. */
  readonly pathDistance: number;
}

export interface CableCarRoute {
  /** Haul rope: station pulleys and pylon saddles with sag. */
  readonly cable: RoutePolyline;
  /** Where the gondola floor travels (cable minus hanger length). */
  readonly gondolaPath: RoutePolyline;
  readonly stations: readonly CableCarStation[];
  readonly pylons: readonly Vec3[];
  readonly gondolas: number;
  readonly legSeconds: number;
  readonly hangerLength: number;
}

export interface TBarRoute {
  /** Path the rider's feet are dragged along (terrain following). */
  readonly ridePath: RoutePolyline;
  /** Overhead haul rope. */
  readonly cable: RoutePolyline;
  readonly bottom: Vec3;
  readonly top: Vec3;
  readonly pylons: readonly Vec3[];
  readonly bars: number;
  readonly speed: number;
}

export interface CoasterRoute {
  /** Trough centreline (bob floor), including the launch ramp. */
  readonly track: RoutePolyline;
  /** Bank angle (radians, positive = leaning right) per track point. */
  readonly bank: readonly number[];
  /** Index into `track.points` where the wooden launch kicker begins. */
  readonly kickerStart: number;
  readonly start: Vec3;
  readonly rampEnd: Vec3;
  readonly rampAngle: number;
  readonly pillars: readonly { readonly top: Vec3; readonly ground: number }[];
  readonly speed: number;
}

export interface Runway {
  readonly id: 'water_runway' | 'glacier_runway';
  readonly start: Vec3;
  readonly end: Vec3;
  readonly width: number;
  readonly surface: 'water' | 'snow';
}

export interface HammockCatapult {
  readonly anchorA: Vec3;
  readonly anchorB: Vec3;
  readonly seat: Vec3;
  readonly target: Vec3;
  /** Ballistic arc sampled for the launch (seat → target). */
  readonly arc: RoutePolyline;
  readonly tensionSeconds: number;
}

export interface CowPatrol {
  readonly home: Vec3;
  readonly patrol: readonly Vec3[];
  readonly rampageRoute: RoutePolyline;
}

export interface MapRoutes {
  readonly tankRoad: RoadRoute;
  readonly coastalRamp: RoadRoute;
  readonly villageLanes: readonly RoadRoute[];
  readonly cableCar: CableCarRoute;
  readonly tBar: TBarRoute;
  readonly coaster: CoasterRoute;
  readonly runways: readonly Runway[];
  readonly hammock: HammockCatapult;
  readonly cow: CowPatrol;
  readonly gorgeStream: RoutePolyline;
}

export type DestructibleBuildingKind = 'beach_bar' | 'chalet' | 'side_hut';

export interface DestructibleBuilding {
  readonly id: string;
  /** Stable numeric id used by `S2C_MAP_STATE_SYNC` destructible entries. */
  readonly netId: number;
  readonly kind: DestructibleBuildingKind;
  readonly propId: string;
  readonly tower: TowerId;
  readonly nameKey: TranslationKey;
  readonly position: Vec3;
  readonly rotationY: number;
  readonly footprint: Vec2;
  readonly maxHp: number;
  /** Height of the charred ground-floor masonry left by a collapse. */
  readonly ruinHeight: number;
}

export interface BridgeSegment {
  readonly id: string;
  /** Stable numeric id used by `S2C_MAP_STATE_SYNC` bridge entries. */
  readonly netId: number;
  readonly structure: 'suspension_bridge' | 'pier_ne' | 'pier_e' | 'pier_s' | 'pier_w';
  readonly propId: string;
  readonly pieceId: string;
  readonly start: Vec3;
  readonly end: Vec3;
  readonly width: number;
  readonly maxHp: number;
  readonly patchedHp: number;
  /** Posts a repairing player must stand near. */
  readonly repairPosts: readonly Vec3[];
}

export interface FallableTree {
  readonly id: string;
  readonly netId: number;
  readonly species: 'fir' | 'palm';
  readonly propId: string;
  readonly position: Vec3;
  readonly height: number;
  readonly trunkRadius: number;
  readonly fallenLength: number;
  readonly maxHp: number;
}

export interface ExplosiveSilo {
  readonly id: string;
  readonly netId: number;
  readonly kind: 'cheese_wheel' | 'coconut_silo';
  readonly propId: string;
  readonly position: Vec3;
  readonly maxHp: number;
  readonly blastRadius: number;
  readonly blastDamage: number;
}

export interface TourismBillboard {
  readonly id: string;
  readonly netId: number;
  readonly propId: string;
  readonly position: Vec3;
  readonly rotationY: number;
  readonly width: number;
  readonly height: number;
  /** i18n key of the localized title overlaid on the poster's top band. */
  readonly adKey: TranslationKey;
  /** Painted textless poster (`/art/billboards/poster-<id>.jpg` on the client). */
  readonly posterId: BillboardPosterId;
}

export type BillboardPosterId = 'cheese' | 'lagoon' | 'cablecar' | 'fondue' | 'biplane' | 'cuckoo';

export interface MapDestructibles {
  readonly buildings: readonly DestructibleBuilding[];
  readonly bridgeSegments: readonly BridgeSegment[];
  readonly trees: readonly FallableTree[];
  readonly silos: readonly ExplosiveSilo[];
  readonly billboards: readonly TourismBillboard[];
}

export interface NavNode {
  readonly id: number;
  readonly position: Vec3;
  readonly zone: ZoneId;
  /** Swim exit at the foot of a water stair: bots in the water head here, but never patrol to it. */
  readonly water?: boolean;
}

export interface NavGraph {
  readonly nodes: readonly NavNode[];
  /** Undirected edges as node index pairs; every edge is walkable on foot. */
  readonly edges: readonly (readonly [number, number])[];
}

/** Area with a known surface that overrides the terrain tag (decks, floors). */
export interface SurfaceRegion {
  readonly shape:
    | { readonly type: 'circle'; readonly center: Vec2; readonly radius: number }
    | {
        readonly type: 'rect';
        readonly center: Vec2;
        readonly halfSize: Vec2;
        readonly rotationY: number;
      };
  /** Walking height of the region surface. */
  readonly top: number;
  readonly tag: SurfaceTag;
}

export interface IcePatch {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}
