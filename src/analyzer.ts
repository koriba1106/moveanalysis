import { DEFAULT_CONFIG, AnalyzerConfig, BodyFrame, HoldPoint, LandmarkSet, MoveType, OutputMode, Point, computeBodyFrame } from './model';
import { MoveDetector } from './move-detector';
import { MoveStabilizer } from './stabilizer';
import { HoldManager } from './hold-manager';
import { PoseEngine, normalizePose, requiredMoveLandmarks } from './pose';
import { Renderer } from './renderer';
import { VerifiedMp4Exporter, ExportStats } from './exporter';

export type AnalysisSnapshot={landmarks:LandmarkSet|null;body:BodyFrame|null;move:MoveType;holds:HoldPoint[];trigger:boolean;frameIndex:number};

export class Analyzer {
  readonly config:AnalyzerConfig; private pose=new PoseEngine(); private detector:MoveDetector; private stabilizer:MoveStabilizer; private hold:HoldManager;
  private lostSeconds=0; private cooldown=0; private lastTrigger=MoveType.NORMAL;
  private ema=new Map<string,Point>(); private snapshot:AnalysisSnapshot={landmarks:null,body:null,move:MoveType.NORMAL,holds:[],trigger:false,frameIndex:0};
  constructor(config:Partial<AnalyzerConfig>={}){this.config={...DEFAULT_CONFIG,...config,thresholds:{...DEFAULT_CONFIG.thresholds,...config.thresholds}};this.detector=new MoveDetector(this.config.thresholds);this.stabilizer=new MoveStabilizer(2);this.hold=new HoldManager(3,this.config.holdSpeedThreshold,this.config.holdMergeDistance);}
  async init(){await this.pose.init(this.config.wasmUrl,this.config.modelUrl);}
  close(){this.pose.close();}
  reset(fps:number){this.lostSeconds=0;this.cooldown=0;this.lastTrigger=MoveType.NORMAL;this.ema.clear();this.stabilizer=new MoveStabilizer(Math.max(2,Math.round(this.config.moveConfirmSeconds*fps)),1);this.hold=new HoldManager(Math.max(3,Math.round(this.config.holdStopSeconds*fps)),this.config.holdSpeedThreshold,this.config.holdMergeDistance);this.snapshot={landmarks:null,body:null,move:MoveType.NORMAL,holds:[],trigger:false,frameIndex:0};}
  tickCooldown(seconds:number){this.cooldown=Math.max(0,this.cooldown-seconds);}
  processFrame(video:HTMLVideoElement,timestampMs:number,frameIndex:number,fps:number):AnalysisSnapshot{
    let l:LandmarkSet|null=null; let body:BodyFrame|null=null; let trigger=false;
    const result=this.pose.detect(video,timestampMs); const fresh=normalizePose(result,this.config.minVisibility);
    if(!fresh||!requiredMoveLandmarks(fresh)){this.lostSeconds+=1/fps;if(this.lostSeconds>=this.config.lostResetSeconds){this.reset(fps);}this.snapshot={...this.snapshot,landmarks:null,body:null,trigger:false,frameIndex};return this.snapshot;}
    this.lostSeconds=0; l=this.applyEma(fresh); body=computeBodyFrame(l);
    if(body){
      for(const limb of ['leftWrist','rightWrist','leftAnkle','rightAnkle'])this.hold.update(limb,l[limb],body);
      const detected=this.detector.detect(l,body); const stable=this.stabilizer.update(detected); this.cooldown=Math.max(0,this.cooldown-1/fps);
      if(stable.changed&&stable.move!==MoveType.NORMAL&&this.cooldown<=1e-9&&stable.move!==this.lastTrigger){trigger=true;this.cooldown=this.config.cooldownSeconds;this.lastTrigger=stable.move;}
      if(stable.move===MoveType.NORMAL)this.lastTrigger=MoveType.NORMAL;
      this.snapshot={landmarks:l,body,move:stable.move,holds:this.hold.all,trigger,frameIndex};
    }else this.snapshot={landmarks:l,body:null,move:this.stabilizer.current,holds:this.hold.all,trigger:false,frameIndex};
    return this.snapshot;
  }
  private applyEma(fresh:LandmarkSet):LandmarkSet{const out:LandmarkSet={};for(const [k,p] of Object.entries(fresh)){const old=this.ema.get(k);const q=old?{x:old.x*(1-this.config.emaAlpha)+p.x*this.config.emaAlpha,y:old.y*(1-this.config.emaAlpha)+p.y*this.config.emaAlpha,z:p.z,visibility:p.visibility}:p;this.ema.set(k,q);out[k]=q;}return out;}
  async exportVideo(input:HTMLVideoElement,canvas:HTMLCanvasElement,renderer:Renderer,fps:number,duration:number,signal:AbortSignal,onProgress:(p:number)=>void):Promise<{blob:Blob;stats:ExportStats}>{
    this.reset(fps); const sourceFrames=Math.max(1,Math.ceil(duration*fps)); const pauseFrames=Math.max(0,Math.round(this.config.pauseSeconds*fps));
    const exporter=new VerifiedMp4Exporter(); let lastCanvasHasFrame=false;
    return exporter.exportStream(canvas,fps,async writer=>{
      for(let sourceIndex=0;sourceIndex<sourceFrames;sourceIndex++){
        if(signal.aborted)throw new DOMException('Canceled','AbortError');
        const t=Math.min(sourceIndex/fps,Math.max(0,duration-1e-6)); await seekExact(input,t,signal);
        const snap=this.processFrame(input,t*1000,sourceIndex,fps); renderer.draw(input,snap.landmarks,snap.body,snap.holds,snap.move,this.config.drawSkeleton); lastCanvasHasFrame=true;
        await writer.addFrame();
        if(this.config.outputMode===OutputMode.MOVES_AND_PAUSE&&snap.trigger){
          for(let j=0;j<pauseFrames;j++){await writer.addFrame();this.tickCooldown(1/fps);}
        }
      }
      if(!lastCanvasHasFrame)throw new Error('No rendered frame was produced.');
    },signal,onProgress);
  }

}

async function seekExact(video:HTMLVideoElement,time:number,signal:AbortSignal){
  if(signal.aborted)throw new DOMException('Canceled','AbortError');
  if(Math.abs(video.currentTime-time)<0.0005){await waitFrame(video,signal);return;}
  await new Promise<void>((resolve,reject)=>{
    let done=false; const cleanup=()=>{video.removeEventListener('seeked',onSeeked);video.removeEventListener('error',onError);signal.removeEventListener('abort',onAbort);};
    const finish=(err?:Error)=>{if(done)return;done=true;cleanup();err?reject(err):resolve();};
    const onSeeked=()=>finish(); const onError=()=>finish(new Error('Video seek failed.')); const onAbort=()=>finish(new DOMException('Canceled','AbortError'));
    video.addEventListener('seeked',onSeeked,{once:true});video.addEventListener('error',onError,{once:true});signal.addEventListener('abort',onAbort,{once:true});video.currentTime=time;
  });
  await waitFrame(video,signal);
}
async function waitFrame(video:HTMLVideoElement,signal:AbortSignal){
  if(signal.aborted)throw new DOMException('Canceled','AbortError');
  if('requestVideoFrameCallback' in video){await new Promise<void>((resolve,reject)=>{const id=video.requestVideoFrameCallback(()=>resolve());const onAbort=()=>{try{video.cancelVideoFrameCallback(id);}catch{};reject(new DOMException('Canceled','AbortError'));};signal.addEventListener('abort',onAbort,{once:true});});}
  else await new Promise(r=>setTimeout(r,0));
}
