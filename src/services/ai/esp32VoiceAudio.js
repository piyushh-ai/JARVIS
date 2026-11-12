function audioError(message,statusCode){const e=new Error(message);e.name="VoiceAudioError";e.statusCode=statusCode;return e;}
export function decodeMuLawSample(value){const u=(~value)&255,sign=u&128,exponent=(u>>4)&7,mantissa=u&15;let sample=((mantissa<<3)+132)<<exponent;sample-=132;return sign?-sample:sample;}
export function normalizePcm16(samples,{targetPeak=23000,maxGain=40}={}){
 if(!(samples instanceof Int16Array)||!samples.length)throw audioError("Audio contains no samples",400);
 const mean=samples.reduce((s,v)=>s+v,0)/samples.length,out=new Int16Array(samples.length);let peak=0,prevX=0,prevY=0;
 const rc=1/(2*Math.PI*100),dt=1/16000,alpha=rc/(rc+dt),filtered=new Float32Array(samples.length);
 for(let i=0;i<samples.length;i++){const x=samples[i]-mean,y=alpha*(prevY+x-prevX);prevX=x;prevY=y;filtered[i]=y;peak=Math.max(peak,Math.abs(y));}
 const filteredMean=filtered.reduce((sum,value)=>sum+value,0)/filtered.length;peak=0;for(let i=0;i<filtered.length;i++){filtered[i]-=filteredMean;peak=Math.max(peak,Math.abs(filtered[i]));}
 const gain=peak?Math.min(maxGain,targetPeak/peak):1;for(let i=0;i<out.length;i++)out[i]=Math.max(-32768,Math.min(32767,Math.round(filtered[i]*gain)));return out;
}
function writePcmWav(samples,rate=16000){const b=Buffer.alloc(44+samples.length*2);b.write("RIFF",0);b.writeUInt32LE(b.length-8,4);b.write("WAVE",8);b.write("fmt ",12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write("data",36);b.writeUInt32LE(samples.length*2,40);for(let i=0;i<samples.length;i++)b.writeInt16LE(samples[i],44+i*2);return b;}
function resample(src,from,to){if(from===to)return src;const n=Math.max(1,Math.round(src.length*to/from)),out=new Int16Array(n);for(let i=0;i<n;i++){const p=i*from/to,l=Math.floor(p),h=Math.min(src.length-1,l+1),f=p-l;out[i]=Math.round(src[l]*(1-f)+src[h]*f);}return out;}
export function parseAndPrepareVoiceWav(buffer,codecHeader=""){
 if(!Buffer.isBuffer(buffer)||buffer.length<44||buffer.toString("ascii",0,4)!=="RIFF"||buffer.toString("ascii",8,12)!=="WAVE"||buffer.readUInt32LE(4)!==buffer.length-8)throw audioError("Invalid RIFF/WAVE audio payload",400);
 let offset=12,fmt=null,dataOffset=-1,dataSize=0;
 while(offset+8<=buffer.length){const id=buffer.toString("ascii",offset,offset+4),size=buffer.readUInt32LE(offset+4),start=offset+8,end=start+size;if(end>buffer.length)throw audioError("WAV chunk exceeds payload",400);if(id==="fmt "){if(size<16)throw audioError("Invalid WAV fmt chunk",400);fmt={encoding:buffer.readUInt16LE(start),channels:buffer.readUInt16LE(start+2),rate:buffer.readUInt32LE(start+4),byteRate:buffer.readUInt32LE(start+8),align:buffer.readUInt16LE(start+12),bits:buffer.readUInt16LE(start+14)};}if(id==="data"){dataOffset=start;dataSize=size;}offset=end+(size&1);}
 if(!fmt||dataOffset<0||!dataSize||dataOffset+dataSize+(dataSize&1)!==buffer.length)throw audioError("WAV data chunk is missing or does not match payload",400);
 if(fmt.channels!==1||fmt.align!==fmt.bits/8||fmt.byteRate!==fmt.rate*fmt.align)throw audioError("WAV must be valid mono audio",415);
 let source;if(fmt.encoding===7&&fmt.bits===8&&fmt.rate===16000){if(String(codecHeader).toLowerCase()!=="mulaw")throw audioError("X-Audio-Codec must be mulaw for G.711 audio",415);source=new Int16Array(dataSize);for(let i=0;i<dataSize;i++)source[i]=decodeMuLawSample(buffer[dataOffset+i]);}
 else if(fmt.encoding===1&&fmt.bits===16&&[8000,16000].includes(fmt.rate)){if(String(codecHeader).toLowerCase()==="mulaw"||dataSize%2)throw audioError("Codec header does not match PCM16 WAV",415);source=new Int16Array(dataSize/2);for(let i=0;i<source.length;i++)source[i]=buffer.readInt16LE(dataOffset+i*2);}
 else throw audioError("WAV must be G.711 mu-law 16 kHz mono or PCM16 8/16 kHz mono",415);
 const clean=normalizePcm16(resample(source,fmt.rate,16000)),padded=new Int16Array(clean.length+6400);padded.set(clean,3200);return writePcmWav(padded,16000);
}
