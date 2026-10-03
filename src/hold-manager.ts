import { BodyFrame, HoldPoint, Point } from './model';

type State={last?:Point;stableFrames:number;registered:boolean};
export class HoldManager {
  private states=new Map<string,State>(); private holds:HoldPoint[]=[];
  constructor(private readonly stopFrames:number,private readonly speedThreshold:number,private readonly mergeDistance:number){}
  reset(){this.states.clear();this.holds=[];}
  update(limb:string,p:Point,body:BodyFrame):HoldPoint|null{
    const s=this.states.get(limb)??{stableFrames:0,registered:false};
    const speed=s.last?Math.hypot(p.x-s.last.x,p.y-s.last.y)/body.torsoLength:Infinity;
    if(speed<this.speedThreshold){s.stableFrames++;}else{s.stableFrames=0;s.registered=false;}
    s.last=p; this.states.set(limb,s);
    if(s.stableFrames>=this.stopFrames&&!s.registered){
      const q=body.toRel(p); s.registered=true;
      const existing=this.holds.find(h=>Math.hypot(h.x-q.x,h.y-q.y)<=this.mergeDistance);
      if(existing){existing.x=(existing.x*existing.count+q.x)/(existing.count+1);existing.y=(existing.y*existing.count+q.y)/(existing.count+1);existing.count++;return existing;}
      const hold={limb,x:q.x,y:q.y,count:1};this.holds.push(hold);return hold;
    }
    return null;
  }
  get all(){return [...this.holds];}
}
