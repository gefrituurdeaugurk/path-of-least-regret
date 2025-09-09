export interface Point { x:number; y:number; }
export interface Triangle { a:Point; b:Point; c:Point; }
export interface Mesh { polygon:Point[]; tris:Triangle[]; adj:number[][]; centroids: Point[]; debug?: any; }

export interface BuildOptions { validate?:boolean; includeDebug?:boolean; errorMode?:'throw'|'code'; }
export interface PathOptions extends BuildOptions { smooth?:boolean; smoothIterations?:number; snapNudge?:number; }

export const ErrorCodes: {
  OUTSIDE_POLY: 'OUTSIDE_POLY';
  NO_PATH: 'NO_PATH';
  NOT_ENOUGH_VERTICES: 'NOT_ENOUGH_VERTICES';
  DUPLICATE_ADJACENT_VERTEX: 'DUPLICATE_ADJACENT_VERTEX';
  SELF_INTERSECTION: 'SELF_INTERSECTION';
};

export function buildNavMesh(polygon:Point[], opts?:BuildOptions): Mesh | { ok:false; code:string; errors:any[] };
export function findPath(mesh:Mesh, start:Point, end:Point, opts?:PathOptions): { ok:true; path:Point[]; triPath?:number[]; portals?:any } | { ok:false; code:string };
export function pathfind(polygon:Point[], start:Point, end:Point, opts?:PathOptions): { ok:true; path:Point[]; triPath?:number[]; portals?:any } | { ok:false; code:string; errors?:any[] };
export function updatePolygon(mesh:Mesh, newPoly:Point[], opts?:BuildOptions): { changed:boolean; mesh:Mesh };

export const ValidationErrorCodes: {
  NOT_ENOUGH_VERTICES: 'NOT_ENOUGH_VERTICES';
  DUPLICATE_ADJACENT_VERTEX: 'DUPLICATE_ADJACENT_VERTEX';
  SELF_INTERSECTION: 'SELF_INTERSECTION';
};

export const V: {
  sub(a:Point,b:Point):Point;
  add(a:Point,b:Point):Point;
  dot(a:Point,b:Point):number;
  cross(a:Point,b:Point):number;
  scale(a:Point,s:number):Point;
  len(a:Point):number;
  dist(a:Point,b:Point):number;
};
