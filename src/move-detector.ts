import { BodyFrame, LandmarkSet, MoveThresholds, MoveType, calcAngle } from './model';

export class MoveDetector {
  constructor(private readonly t:MoveThresholds){}
  detect(l:LandmarkSet,b:BodyFrame):MoveType {
    const r=(name:string)=>l[name];
    const rel=(name:string)=>b.toRel(r(name));
    const lk=calcAngle(r('leftHip'),r('leftKnee'),r('leftAnkle'));
    const rk=calcAngle(r('rightHip'),r('rightKnee'),r('rightAnkle'));
    const lw=rel('leftWrist'), rw=rel('rightWrist'), la=rel('leftAnkle'), ra=rel('rightAnkle');
    const lkR=rel('leftKnee'), rkR=rel('rightKnee');

    // Priority is intentionally kept compatible with v2.1: hooks → diagonal/flag → toe → drop-knee → cross.
    if(lk<=this.t.heelKneeAngle && la.y-rkR.y<=this.t.heelAnkleVsKnee && la.y<=this.t.heelMinRelY)return MoveType.HEEL_HOOK_L;
    if(rk<=this.t.heelKneeAngle && ra.y-lkR.y<=this.t.heelAnkleVsKnee && ra.y<=this.t.heelMinRelY)return MoveType.HEEL_HOOK_R;

    if(b.lateralValid){
      const rightDiag=rw.y>=this.t.diagWristMinY && la.y<=this.t.diagAnkleMaxY && (rw.y-la.y)>=this.t.diagMinSpan && lw.y<=rw.y-this.t.diagOtherWristDrop && lk>=this.t.diagLegMinAngle;
      const leftDiag=lw.y>=this.t.diagWristMinY && ra.y<=this.t.diagAnkleMaxY && (lw.y-ra.y)>=this.t.diagMinSpan && rw.y<=lw.y-this.t.diagOtherWristDrop && rk>=this.t.diagLegMinAngle;
      if(rightDiag)return MoveType.DIAGONAL_R;
      if(leftDiag)return MoveType.DIAGONAL_L;
      const rightFlag=Math.abs(ra.x)>this.t.flagMinLateral && rk>=this.t.flagMinKneeAngle && ra.y<=this.t.flagAnkleMaxRelY && ra.y>=this.t.flagAnkleMinRelY;
      const leftFlag=Math.abs(la.x)>this.t.flagMinLateral && lk>=this.t.flagMinKneeAngle && la.y<=this.t.flagAnkleMaxRelY && la.y>=this.t.flagAnkleMinRelY;
      if(rightFlag)return MoveType.FLAG_R;
      if(leftFlag)return MoveType.FLAG_L;
    }

    if(lk>=this.t.toeMinKneeAngle && la.y-rkR.y<=this.t.toeVsAnkle && la.y<=this.t.toeMinRelY && Math.abs(la.x)>this.t.toeMinLateral)return MoveType.TOE_HOOK_L;
    if(rk>=this.t.toeMinKneeAngle && ra.y-lkR.y<=this.t.toeVsAnkle && ra.y<=this.t.toeMinRelY && Math.abs(ra.x)>this.t.toeMinLateral)return MoveType.TOE_HOOK_R;

    if(lk>=this.t.dropKneeAngle[0]&&lk<=this.t.dropKneeAngle[1]&&Math.abs(lkR.x)>=this.t.dropKneeLateral&&lkR.y<=this.t.dropKneeMaxKneeY)return MoveType.DROP_KNEE_L;
    if(rk>=this.t.dropKneeAngle[0]&&rk<=this.t.dropKneeAngle[1]&&Math.abs(rkR.x)>=this.t.dropKneeLateral&&rkR.y<=this.t.dropKneeMaxKneeY)return MoveType.DROP_KNEE_R;

    const separation=rw.x-lw.x;
    if(Math.abs(separation)>=this.t.crossSeparation){
      const rOver=Math.max(0,rw.x-this.t.crossMidline), lOver=Math.max(0,this.t.crossMidline-lw.x);
      if(rOver>=lOver&&rOver>0)return MoveType.CROSS_R_OVER_L;
      if(lOver>0)return MoveType.CROSS_L_OVER_R;
    }
    return MoveType.NORMAL;
  }
}
