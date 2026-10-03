import { FilesetResolver, PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { LandmarkSet, Point } from './model';

const IDX={
  nose:0,leftShoulder:11,rightShoulder:12,leftElbow:13,rightElbow:14,leftWrist:15,rightWrist:16,
  leftHip:23,rightHip:24,leftKnee:25,rightKnee:26,leftAnkle:27,rightAnkle:28,leftHeel:29,rightHeel:30,leftFoot:31,rightFoot:32
} as const;

export class PoseEngine {
  private landmarker:PoseLandmarker|null=null;
  async init(wasmUrl:string,modelUrl:string){
    const vision=await FilesetResolver.forVisionTasks(wasmUrl);
    this.landmarker=await PoseLandmarker.createFromOptions(vision,{
      baseOptions:{modelAssetPath:modelUrl,delegate:'GPU'},
      runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:0.6,minPosePresenceConfidence:0.6,minTrackingConfidence:0.6,
      outputSegmentationMasks:false
    });
  }
  detect(video:HTMLVideoElement,timestampMs:number):PoseLandmarkerResult{
    if(!this.landmarker)throw new Error('Pose engine is not initialized.');
    return this.landmarker.detectForVideo(video,timestampMs);
  }
  close(){this.landmarker?.close();this.landmarker=null;}
}

export function normalizePose(result:PoseLandmarkerResult,minVisibility:number):LandmarkSet|null{
  const raw=result.landmarks?.[0]; if(!raw)return null;
  const get=(idx:number):Point|null=>{const p=raw[idx];if(!p)return null;return{x:p.x,y:p.y,z:p.z,visibility:p.visibility??1};};
  const required=Object.entries(IDX).map(([name,idx])=>[name,get(idx)] as const);
  const out:LandmarkSet={};
  for(const [name,p] of required){if(p&&p.visibility>=minVisibility)out[name]=p;}
  // Required geometry must be fresh; wrists/ankles may be absent and are rejected by caller.
  if(!out.leftShoulder||!out.rightShoulder||!out.leftHip||!out.rightHip)return null;
  return out;
}

export function requiredMoveLandmarks(l:LandmarkSet){
  return ['leftWrist','rightWrist','leftAnkle','rightAnkle','leftKnee','rightKnee','leftHip','rightHip'].every(k=>!!l[k]);
}
