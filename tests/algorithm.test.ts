import { describe, expect, it } from 'vitest';
import { computeBodyFrame, MoveType } from '../src/model';
import { MoveStabilizer } from '../src/stabilizer';

const p=(x:number,y:number)=>({x,y,visibility:1});

describe('body coordinate frame',()=>{
  it('uses the hip midpoint as origin',()=>{
    const l={leftShoulder:p(.4,.3),rightShoulder:p(.6,.3),leftHip:p(.45,.55),rightHip:p(.55,.55)} as any;
    const b=computeBodyFrame(l); expect(b).not.toBeNull(); expect(b!.toRel(p(.5,.55)).x).toBeCloseTo(0); expect(b!.toRel(p(.5,.55)).y).toBeCloseTo(0);
  });
});

describe('move stabilization',()=>{
  it('does not confirm a transient move',()=>{
    const s=new MoveStabilizer(3,1); s.update(MoveType.FLAG_L); s.update(MoveType.NORMAL); expect(s.current).toBe(MoveType.NORMAL);
  });
  it('confirms a sustained move',()=>{
    const s=new MoveStabilizer(3,1); s.update(MoveType.FLAG_L); s.update(MoveType.FLAG_L); expect(s.update(MoveType.FLAG_L).changed).toBe(true); expect(s.current).toBe(MoveType.FLAG_L);
  });
});
