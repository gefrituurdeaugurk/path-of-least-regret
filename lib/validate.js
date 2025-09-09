// Polygon validation utilities
export const ValidationErrorCodes = {
  NOT_ENOUGH_VERTICES: 'NOT_ENOUGH_VERTICES',
  DUPLICATE_ADJACENT_VERTEX: 'DUPLICATE_ADJACENT_VERTEX',
  SELF_INTERSECTION: 'SELF_INTERSECTION'
};

export function validatePolygon(poly){
  const errors=[];
  if(!Array.isArray(poly) || poly.length<3){
    errors.push({ code: ValidationErrorCodes.NOT_ENOUGH_VERTICES, message: 'Polygon must have at least 3 vertices' });
    return errors;
  }
  // duplicate adjacent
  for(let i=0;i<poly.length;i++){
    const a=poly[i], b=poly[(i+1)%poly.length];
    if(a.x===b.x && a.y===b.y){
      errors.push({ code: ValidationErrorCodes.DUPLICATE_ADJACENT_VERTEX, message: `Duplicate adjacent vertex at index ${i}` });
      break;
    }
  }
  // simple self intersection check (O(n^2))
  function segInt(a,b,c,d){
    function orient(p,q,r){ return (q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x); }
    const o1=orient(a,b,c), o2=orient(a,b,d), o3=orient(c,d,a), o4=orient(c,d,b);
    if(o1===0 && o2===0 && o3===0 && o4===0) return false; // collinear skip
    return o1*o2<0 && o3*o4<0;
  }
  for(let i=0;i<poly.length;i++){
    const a=poly[i], b=poly[(i+1)%poly.length];
    for(let j=i+1;j<poly.length;j++){
      if(Math.abs(i-j)<=1) continue;
      const c=poly[j], d=poly[(j+1)%poly.length];
      if(i===0 && j===poly.length-1) continue; // shared endpoint
      if(segInt(a,b,c,d)){
        errors.push({ code: ValidationErrorCodes.SELF_INTERSECTION, message: `Self intersection between edges ${i}-${i+1} and ${j}-${j+1}` });
        i=poly.length; break;
      }
    }
  }
  return errors;
}
