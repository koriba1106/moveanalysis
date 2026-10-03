export type Point = { x: number; y: number; z?: number; visibility: number };
export type LandmarkSet = Record<string, Point>;

export enum OutputMode { HOLDS_ONLY = 'holds', MOVES_AND_PAUSE = 'moves_pause' }

export enum MoveType {
  NORMAL='NORMAL', HEEL_HOOK_R='HEEL_HOOK_R', HEEL_HOOK_L='HEEL_HOOK_L',
  TOE_HOOK_R='TOE_HOOK_R', TOE_HOOK_L='TOE_HOOK_L', DROP_KNEE_R='DROP_KNEE_R', DROP_KNEE_L='DROP_KNEE_L',
  CROSS_R_OVER_L='CROSS_R_OVER_L', CROSS_L_OVER_R='CROSS_L_OVER_R', FLAG_R='FLAG_R', FLAG_L='FLAG_L',
  DIAGONAL_R='DIAGONAL_R', DIAGONAL_L='DIAGONAL_L'
}

export const MOVE_LABELS: Record<MoveType,string> = {
  [MoveType.NORMAL]: '通常 / Normal', [MoveType.HEEL_HOOK_R]: '右ヒールフック / Heel Hook R',
  [MoveType.HEEL_HOOK_L]: '左ヒールフック / Heel Hook L', [MoveType.TOE_HOOK_R]: '右トゥーフック / Toe Hook R',
  [MoveType.TOE_HOOK_L]: '左トゥーフック / Toe Hook L', [MoveType.DROP_KNEE_R]: '右ドロップニー / Drop Knee R',
  [MoveType.DROP_KNEE_L]: '左ドロップニー / Drop Knee L', [MoveType.CROSS_R_OVER_L]: '右手クロス / Cross R→L',
  [MoveType.CROSS_L_OVER_R]: '左手クロス / Cross L→R', [MoveType.FLAG_R]: '右フラッギング / Flag R',
  [MoveType.FLAG_L]: '左フラッギング / Flag L', [MoveType.DIAGONAL_R]: '右対角 / Diagonal R',
  [MoveType.DIAGONAL_L]: '左対角 / Diagonal L'
};

export type MoveThresholds = {
  heelKneeAngle:number; heelAnkleVsKnee:number; heelMinRelY:number;
  toeMinKneeAngle:number; toeVsAnkle:number; toeMinRelY:number; toeMinLateral:number;
  dropKneeAngle:[number,number]; dropKneeLateral:number; dropKneeMaxKneeY:number;
  crossMidline:number; crossSeparation:number;
  flagMinKneeAngle:number; flagMinLateral:number; flagAnkleMaxRelY:number; flagAnkleMinRelY:number;
  diagWristMinY:number; diagAnkleMaxY:number; diagMinSpan:number; diagOtherWristDrop:number; diagLegMinAngle:number;
};

export const DEFAULT_THRESHOLDS: MoveThresholds = {
  heelKneeAngle:50, heelAnkleVsKnee:-0.25, heelMinRelY:-0.7,
  toeMinKneeAngle:115, toeVsAnkle:-0.15, toeMinRelY:-0.6, toeMinLateral:1.2,
  dropKneeAngle:[60,125], dropKneeLateral:0.35, dropKneeMaxKneeY:0,
  crossMidline:0.3, crossSeparation:0.3,
  flagMinKneeAngle:140, flagMinLateral:1.4, flagAnkleMaxRelY:-0.6, flagAnkleMinRelY:-2.4,
  diagWristMinY:2.6, diagAnkleMaxY:-2.4, diagMinSpan:1.5, diagOtherWristDrop:1.0, diagLegMinAngle:130
};

export type AnalyzerConfig = {
  outputMode:OutputMode; pauseSeconds:number; cooldownSeconds:number; minVisibility:number;
  emaAlpha:number; holdStopSeconds:number; holdSpeedThreshold:number; holdMergeDistance:number;
  moveConfirmSeconds:number; lostResetSeconds:number; maxConsecutiveErrors:number;
  modelUrl:string; wasmUrl:string; modelVariant:'lite'|'full'|'heavy';
  drawSkeleton:boolean; thresholds:MoveThresholds;
};

export const DEFAULT_CONFIG:AnalyzerConfig = {
  outputMode:OutputMode.MOVES_AND_PAUSE, pauseSeconds:1, cooldownSeconds:2,
  minVisibility:0.65, emaAlpha:0.4, holdStopSeconds:0.25, holdSpeedThreshold:0.25,
  holdMergeDistance:0.25, moveConfirmSeconds:0.12, lostResetSeconds:0.5, maxConsecutiveErrors:30,
  modelUrl:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  wasmUrl:'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm', modelVariant:'full', drawSkeleton:true,
  thresholds:DEFAULT_THRESHOLDS
};

export type BodyFrame = {
  origin:Point; uSpine:Point; uLat:Point; lateralValid:boolean; torsoLength:number; unit:number;
  toRel(p:Point):{x:number;y:number};
};

export type HoldPoint = { limb:string; x:number; y:number; count:number };

export function dist(a:Point,b:Point){return Math.hypot(a.x-b.x,a.y-b.y);}
export function sub(a:Point,b:Point):Point{return {x:a.x-b.x,y:a.y-b.y,visibility:Math.min(a.visibility,b.visibility)};}
export function add(a:Point,b:Point):Point{return {x:a.x+b.x,y:a.y+b.y,visibility:Math.min(a.visibility,b.visibility)};}
export function mul(a:Point,s:number):Point{return {x:a.x*s,y:a.y*s,visibility:a.visibility};}
export function dot(a:Point,b:Point){return a.x*b.x+a.y*b.y;}
export function norm(a:Point){return Math.hypot(a.x,a.y);}
export function unit(a:Point):Point{const n=norm(a);return n>1e-9?{x:a.x/n,y:a.y/n,visibility:a.visibility}:{x:0,y:0,visibility:a.visibility};}
export function calcAngle(a:Point,b:Point,c:Point){const ab=sub(a,b), cb=sub(c,b), na=norm(ab), nc=norm(cb);if(na<1e-9||nc<1e-9)return 0;const cos=Math.max(-1,Math.min(1,dot(ab,cb)/(na*nc)));return Math.acos(cos)*180/Math.PI;}

export function computeBodyFrame(l:LandmarkSet):BodyFrame|null {
  const ls=l.leftShoulder, rs=l.rightShoulder, lh=l.leftHip, rh=l.rightHip;
  if(!ls||!rs||!lh||!rh)return null;
  const origin=mul(add(lh,rh),0.5); const shoulderMid=mul(add(ls,rs),0.5);
  const spineVec=sub(shoulderMid,origin); const torsoLength=norm(spineVec); if(torsoLength<1e-6)return null;
  const uSpine=unit(spineVec);
  let latRaw=sub(rh,lh); // right from left; shooting direction therefore does not define lateral sign.
  const projection=dot(latRaw,uSpine); latRaw=sub(latRaw,mul(uSpine,projection));
  let uLat=unit(latRaw);
  if(norm(latRaw)<0.12*torsoLength){
    latRaw=sub(rs,ls); const p=dot(latRaw,uSpine); latRaw=sub(latRaw,mul(uSpine,p)); uLat=unit(latRaw);
  }
  const lateralValid=norm(latRaw)>=0.12*torsoLength;
  const unitLen=Math.max(torsoLength*0.6,1);
  return {origin,uSpine,uLat,lateralValid,torsoLength,unit:unitLen,toRel(p){const v=sub(p,origin);return{x:dot(v,uLat)/unitLen,y:dot(v,uSpine)/unitLen};}};
}
