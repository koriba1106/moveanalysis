import { BufferTarget, CanvasSource, Input, Mp4OutputFormat, Output, BlobSource, Quality } from 'mediabunny';

export type ExportStats={expectedFrames:number;encodedFrames:number;expectedDuration:number;actualDuration:number;bytes:number;width:number;height:number;codec:string};

export class VerifiedMp4Exporter {
  async exportStream(canvas:HTMLCanvasElement,fps:number,produce:(writer:{addFrame:()=>Promise<void>;count:number})=>Promise<void>,signal:AbortSignal,onProgress:(p:number)=>void,expectedFrames?:number):Promise<{blob:Blob;stats:ExportStats}>{
    if(!Number.isFinite(fps)||fps<=0)throw new Error('Invalid output FPS.');
    const target=new BufferTarget();
    const output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target});
    const source=new CanvasSource(canvas,{codec:'avc',bitrate:new Quality('high')});
    output.addVideoTrack(source,{frameRate:fps});
    let count=0; const duration=1/fps;
    const writer={count,addFrame:async()=>{
      if(signal.aborted)throw new DOMException('Export canceled','AbortError');
      await source.add(count*duration,duration,{keyFrame:count===0||count%Math.max(1,Math.round(fps*2))===0});
      count++; writer.count=count; onProgress(expectedFrames?Math.min(1,count/expectedFrames):0);
    }};
    try{
      await output.start(); await produce(writer);
      if(count<1)throw new Error('No frames were encoded.');
      source.close(); await output.finalize();
      const buffer=target.buffer; if(!buffer||buffer.byteLength<1024)throw new Error('Encoder produced an empty or implausibly small MP4.');
      const blob=new Blob([buffer],{type:'video/mp4'});
      const stats=await this.verify(blob,fps,count,canvas.width,canvas.height,count);
      onProgress(1); return{blob,stats};
    }catch(error){try{await output.cancel();}catch{} throw error;}
  }

  private async verify(blob:Blob,fps:number,expectedFrames:number,width:number,height:number,encodedFrames:number):Promise<ExportStats>{
    const input=new Input({source:new BlobSource(blob),formats:['mp4']});
    const duration=await input.computeDuration(); const track=await input.getPrimaryVideoTrack();
    if(!track)throw new Error('Verification failed: MP4 contains no primary video track.');
    const actualW=await track.getDisplayWidth(), actualH=await track.getDisplayHeight();
    const expectedDuration=expectedFrames/fps, tolerance=Math.max(0.12,2/fps);
    if(!Number.isFinite(duration)||duration<=0)throw new Error('Verification failed: output duration is invalid.');
    if(Math.abs(duration-expectedDuration)>tolerance)throw new Error(`Verification failed: duration mismatch (${duration.toFixed(3)}s vs expected ${expectedDuration.toFixed(3)}s).`);
    if(encodedFrames!==expectedFrames)throw new Error(`Verification failed: encoded frame count ${encodedFrames} != expected ${expectedFrames}.`);
    if(actualW!==width||actualH!==height)throw new Error(`Verification failed: dimensions ${actualW}x${actualH} != ${width}x${height}.`);
    return{expectedFrames,encodedFrames,expectedDuration,actualDuration:duration,bytes:blob.size,width:actualW,height:actualH,codec:(await track.getCodec())??'unknown'};
  }
}
