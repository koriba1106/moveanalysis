import './style.css';
import { Analyzer } from './analyzer';
import { DEFAULT_CONFIG, OutputMode } from './model';
import { Input, ALL_FORMATS, BlobSource } from 'mediabunny';
import { Renderer } from './renderer';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`
<div class="shell">
<header><div><div class="eyebrow">MUKO / CLIMBING VIDEO ANALYSIS</div><h1>ムーブ解析by武庫</h1><p>身体座標系でクライミング・ボルダリングの動きを解析</p></div><div class="version">v3.0 Web</div></header>
<main>
<section class="card input-card"><div class="drop" id="drop"><input id="file" type="file" accept="video/*,.mp4,.mov,.mkv,.webm,.avi" hidden><div class="drop-icon">＋</div><strong>動画を選択</strong><span>クリックまたはドラッグ＆ドロップ</span><small>動画はサーバーへアップロードせず、このブラウザ内で処理します</small></div><div class="meta" id="meta">動画未選択</div></section>
<section class="workspace">
<div class="card viewer"><div class="viewer-head"><div><span class="status-dot" id="dot"></span><span id="status">待機中</span></div><span id="progressText">0%</span></div><div class="canvas-wrap"><video id="video" playsinline muted hidden></video><canvas id="canvas"></canvas><div class="empty" id="empty">解析する動画を選択してください</div></div><div class="bar"><div id="progress"></div></div></div>
<div class="card controls"><h2>解析設定</h2>
<label>出力モード<select id="mode"><option value="moves_pause">ムーブ検出＋停止表示</option><option value="holds">停止点のみ</option></select></label>
<label>停止表示 <output id="pauseOut">1.0 秒</output><input id="pause" type="range" min="0.2" max="3" step="0.1" value="1"></label>
<label>クールダウン <output id="coolOut">2.0 秒</output><input id="cool" type="range" min="0" max="5" step="0.1" value="2"></label>
<label>検出信頼度 <output id="visOut">0.65</output><input id="vis" type="range" min="0.4" max="0.95" step="0.01" value="0.65"></label>
<div class="checks"><label class="check"><input id="skeleton" type="checkbox" checked> 骨格を表示</label></div>
<div class="actions"><button id="analyze" disabled>解析・MP4出力</button><button id="cancel" class="secondary" disabled>キャンセル</button></div>
<div class="result" id="result"></div>
</div></section>
<section class="card details"><h2>処理ポリシー</h2><div class="grid"><div><b>座標系</b><span>腰を原点、背骨方向をY、左右方向をX</span></div><div><b>安定化</b><span>EMA＋時間ベースのムーブ確認</span></div><div><b>出力</b><span>MP4生成後に再読込して期間・サイズ・フレーム数を検証</span></div><div><b>失敗時</b><span>検証を通過しない動画はダウンロードを許可しない</span></div></div></section>
</main><footer>武庫勤労者山岳会（武庫労山） / Move Analysis by Muko</footer></div>`;

const fileInput=document.querySelector<HTMLInputElement>('#file')!,drop=document.querySelector('#drop')!,video=document.querySelector<HTMLVideoElement>('#video')!,canvas=document.querySelector<HTMLCanvasElement>('#canvas')!;
const meta=document.querySelector('#meta')!,status=document.querySelector('#status')!,progress=document.querySelector<HTMLDivElement>('#progress')!,progressText=document.querySelector('#progressText')!,result=document.querySelector<HTMLDivElement>('#result')!;
const analyzeBtn=document.querySelector<HTMLButtonElement>('#analyze')!,cancelBtn=document.querySelector<HTMLButtonElement>('#cancel')!;
const mode=document.querySelector<HTMLSelectElement>('#mode')!,pause=document.querySelector<HTMLInputElement>('#pause')!,cool=document.querySelector<HTMLInputElement>('#cool')!,vis=document.querySelector<HTMLInputElement>('#vis')!,skeleton=document.querySelector<HTMLInputElement>('#skeleton')!;
const pauseOut=document.querySelector('#pauseOut')!,coolOut=document.querySelector('#coolOut')!,visOut=document.querySelector('#visOut')!;
let selected:File|null=null;let url='';let sourceFps=30;let controller:AbortController|null=null;let downloadUrl='';
function setStatus(s:string){status.textContent=s;}
function updateLabels(){pauseOut.textContent=`${Number(pause.value).toFixed(1)} 秒`;coolOut.textContent=`${Number(cool.value).toFixed(1)} 秒`;visOut.textContent=Number(vis.value).toFixed(2);} [pause,cool,vis].forEach(x=>x.addEventListener('input',updateLabels));updateLabels();
function choose(f:File){if(!f.type.startsWith('video/')&&!/\.(mp4|mov|mkv|webm|avi)$/i.test(f.name)){setStatus('対応していないファイルです');return;}selected=f;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(f);video.src=url;video.hidden=false;video.load();analyzeBtn.disabled=false;result.textContent='';}
drop.addEventListener('click',()=>fileInput.click());fileInput.addEventListener('change',()=>fileInput.files?.[0]&&choose(fileInput.files[0]));drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('over')});drop.addEventListener('dragleave',()=>drop.classList.remove('over'));drop.addEventListener('drop',(e)=>{const ev=e as DragEvent;ev.preventDefault();drop.classList.remove('over');const f=ev.dataTransfer?.files[0];if(f)choose(f)});
video.addEventListener('loadedmetadata',async()=>{meta.textContent=`${selected?.name??''} · ${video.videoWidth}×${video.videoHeight} · ${video.duration.toFixed(2)} 秒 · FPS解析中`; if(selected){try{const input=new Input({source:new BlobSource(selected),formats:ALL_FORMATS});const track=await input.getPrimaryVideoTrack();if(track){const m=await track.computeFrameRateMetrics({targetPacketCount:256});if(Number.isFinite(m.bestGuessFrameRate)&&m.bestGuessFrameRate>0)sourceFps=m.bestGuessFrameRate;} meta.textContent=`${selected.name} · ${video.videoWidth}×${video.videoHeight} · ${video.duration.toFixed(2)} 秒 · ${sourceFps.toFixed(3)} fps`;}catch{sourceFps=30;meta.textContent=`${selected?.name??''} · ${video.videoWidth}×${video.videoHeight} · ${video.duration.toFixed(2)} 秒 · 30 fps (fallback)`;}}});
cancelBtn.addEventListener('click',()=>controller?.abort());
analyzeBtn.addEventListener('click',async()=>{if(!selected)return;analyzeBtn.disabled=true;cancelBtn.disabled=false;result.textContent='';progress.style.width='0%';progressText.textContent='0%';setStatus('MediaPipeを初期化中…');controller=new AbortController();
 const config={...DEFAULT_CONFIG,outputMode:mode.value as OutputMode,pauseSeconds:Number(pause.value),cooldownSeconds:Number(cool.value),minVisibility:Number(vis.value),drawSkeleton:skeleton.checked}; const analyzer=new Analyzer(config);const ctx=canvas.getContext('2d',{alpha:false})!;const renderer=new Renderer(ctx,canvas);
 try{await analyzer.init();setStatus('動画を解析・エンコード中…');const out=await analyzer.exportVideo(video,canvas,renderer,sourceFps,video.duration,controller.signal,p=>{const pct=Math.round(p*100);progress.style.width=`${pct}%`;progressText.textContent=`${pct}%`;});
   if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=URL.createObjectURL(out.blob);result.innerHTML=`<div class="ok">✓ 検証済みMP4</div><div>${out.stats.actualDuration.toFixed(2)} 秒 · ${out.stats.width}×${out.stats.height} · ${out.stats.encodedFrames.toLocaleString()} フレーム · ${(out.stats.bytes/1024/1024).toFixed(1)} MB</div><a class="download" href="${downloadUrl}" download="muko-move-analysis.mp4">MP4を保存</a>`;setStatus('完了・出力検証済み');
 }catch(e){if((e as DOMException)?.name==='AbortError'){setStatus('キャンセルしました');result.textContent='未完成の出力は破棄しました。';}else{console.error(e);setStatus('出力に失敗しました');result.textContent=e instanceof Error?e.message:String(e);}}finally{analyzer.close();controller=null;analyzeBtn.disabled=false;cancelBtn.disabled=true;}
});
