import { MoveType } from './model';

export class MoveStabilizer {
  private candidate=MoveType.NORMAL; private count=0; private confirmed=MoveType.NORMAL;
  constructor(private readonly confirmFrames:number, private readonly hysteresisFrames=1){}
  reset(){this.candidate=MoveType.NORMAL;this.count=0;this.confirmed=MoveType.NORMAL;}
  update(next:MoveType):{changed:boolean;move:MoveType}{
    if(next===this.candidate)this.count++;else{this.candidate=next;this.count=1;}
    const need=next===MoveType.NORMAL?this.confirmFrames+this.hysteresisFrames:this.confirmFrames;
    if(next!==this.confirmed&&this.count>=need){this.confirmed=next;return{changed:true,move:next};}
    return{changed:false,move:this.confirmed};
  }
  get current(){return this.confirmed;}
}
