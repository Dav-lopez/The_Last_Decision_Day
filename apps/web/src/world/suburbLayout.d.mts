export declare const HOUSE_SITES: ReadonlyArray<Readonly<{ x: number; z: number; roadSide: number }>>;
export declare const STREET_HALF_WIDTH: number;
export declare const SIDEWALK_OFFSET: number;
export declare const SIDEWALK_WIDTH: number;
export declare function streetFurniture(site: { x: number; z: number; roadSide: number }): {
  sidewalkX: number;
  mailboxX: number;
  mailboxZ: number;
};
