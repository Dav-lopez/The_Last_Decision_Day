function clamp01(v){return Number.isFinite(v)?Math.max(0,Math.min(1,v)):0}

function channels(v){return Array.isArray(v)&&v.length===3?v.map(clamp01):[0.35,0.2,0.14]}

export function skinSurface(linearSkin){
  const [r,g,b]=channels(linearSkin);
  const rgb=values=>values.map(clamp01);
  const light=0.2126*r+0.7152*g+0.0722*b;
  return {subsurfaceTint:rgb([r*0.84+0.015,g*0.81+0.007,b*0.8+0.006]),lip:rgb([r*0.80+0.015,g*0.62+0.006,b*0.72+0.006]),cheek:rgb([r*0.98+0.016,g*0.73+0.004,b*0.72+0.004]),translucencyIntensity:0.08+0.06*Math.sqrt(light)};
}

export function hairSurface(linearHair){return {sheenColor:channels(linearHair).map(v=>clamp01(v*0.72+0.05)),sheenIntensity:0.18,sheenRoughness:0.65}}

export function skinRoughness(sweat){return 0.82-0.13*clamp01(sweat)}

