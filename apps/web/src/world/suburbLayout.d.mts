export declare const HOUSE_SITES: ReadonlyArray<Readonly<{ x: number; z: number; roadSide: number }>>;
export declare const STREET_HALF_WIDTH: number;
export declare const HOUSE_HALF_WIDTH: number;
export declare const ROOF_HALF_SPAN: number;
export declare const ROOF_RISE: number;
export declare function houseStreetFeatures(site: { x: number; z: number; roadSide: number }): {
  streetWallX: number;
  garageFacadeX: number;
  drivewayX: number;
  drivewayLength: number;
  sidewalkX: number;
};
export declare function gableRoofGeometry(): {
  panelWidth: number;
  pitchRadians: number;
  panelCenterY: number;
  ridgeY: number;
};
