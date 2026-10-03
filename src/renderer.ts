import { BodyFrame, HoldPoint, LandmarkSet, MOVE_LABELS, MoveType } from './model';

export class Renderer {
  constructor(private readonly ctx:CanvasRenderingContext2D,private readonly canvas:HTMLCanvasElement){}
  draw(video:HTMLVideoElement,l:LandmarkSet|null,body:BodyFrame|null,holds:HoldPoint[],move:MoveType,drawSkeleton=true){
    const w=video.videoWidth,h=video.videoHeight; if(!w||!h)return;
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    this.ctx.clearRect(0,0,w,h); this.ctx.drawImage(video,0,0,w,h);
    if(drawSkeleton&&l)this.skeleton(l,w,h);
    this.overlay(l,body,holds,move,w,h);
  }
  private skeleton(l:LandmarkSet,w:number,h:number){
    const links=[['leftShoulder','rightShoulder'],['leftShoulder','leftElbow'],['leftElbow','leftWrist'],['rightShoulder','rightElbow'],['rightElbow','rightWrist'],['leftShoulder','leftHip'],['rightShoulder','rightHip'],['leftHip','rightHip'],['leftHip','leftKnee'],['leftKnee','leftAnkle'],['rightHip','rightKnee'],['rightKnee','rightAnkle']];
    this.ctx.save();this.ctx.lineWidth=Math.max(2,w/500);this.ctx.strokeStyle='rgba(100,220,255,.9)';
    for(const [a,b] of links){const p=l[a],q=l[b];if(!p||!q)continue;this.ctx.beginPath();this.ctx.moveTo(p.x*w,p.y*h);this.ctx.lineTo(q.x*w,q.y*h);this.ctx.stroke();}
    this.ctx.fillStyle='#fff';for(const k of Object.keys(l)){const p=l[k];this.ctx.beginPath();this.ctx.arc(p.x*w,p.y*h,Math.max(3,w/350),0,Math.PI*2);this.ctx.fill();}this.ctx.restore();
  }
  private overlay(l:LandmarkSet|null,body:BodyFrame|null,holds:HoldPoint[],move:MoveType,w:number,h:number){
    this.ctx.save(); this.ctx.font=`600 ${Math.max(14,w/70)}px system-ui,sans-serif`;
    this.ctx.fillStyle='rgba(0,0,0,.68)';this.ctx.fillRect(18,18,Math.min(w*.72,420),move===MoveType.NORMAL?62:96);
    this.ctx.fillStyle='#fff';this.ctx.fillText('ムーブ解析by武庫',32,45);this.ctx.font=`700 ${Math.max(16,w/55)}px system-ui,sans-serif`;this.ctx.fillText(MOVE_LABELS[move],32,78);
    this.ctx.font=`600 ${Math.max(13,w/75)}px system-ui,sans-serif`;this.ctx.fillText('Muko / local processing',w-190,34);
    if(body){for(const hold of holds){const x=body.origin.x+body.uLat.x*hold.x*body.unit+body.uSpine.x*hold.y*body.unit;const y=body.origin.y+body.uLat.y*hold.x*body.unit+body.uSpine.y*hold.y*body.unit;this.ctx.strokeStyle='#ff3040';this.ctx.lineWidth=Math.max(3,w/500);this.ctx.beginPath();this.ctx.arc(x,y,Math.max(9,w/70),0,Math.PI*2);this.ctx.stroke();this.ctx.fillStyle='#fff';this.ctx.fillText('H',x-5,y+5);}}
    if(l){const a=l.leftWrist,b=l.rightWrist;if(a&&b){this.ctx.strokeStyle='rgba(255,255,255,.4)';this.ctx.setLineDash([8,8]);this.ctx.beginPath();this.ctx.moveTo(w/2,0);this.ctx.lineTo(w/2,h);this.ctx.stroke();this.ctx.setLineDash([]);}}
    this.ctx.restore();
  }
}
