import { WAKE_WORD_ALIASES, WAKE_WORD_SIMILARITY } from "./voiceConstants.js";
const DEV = {"अ":"a","आ":"aa","ा":"a","ॉ":"o","ृ":"ri","ः":"","़":"","इ":"i","ई":"ee","उ":"u","ऊ":"oo","ए":"e","ऐ":"ai","ओ":"o","औ":"au","क":"k","ख":"kh","ग":"g","घ":"gh","च":"ch","छ":"chh","ज":"j","झ":"jh","ट":"t","ठ":"th","ड":"d","ढ":"dh","त":"t","थ":"th","द":"d","ध":"dh","न":"n","प":"p","फ":"ph","ब":"b","भ":"bh","म":"m","य":"y","र":"r","ल":"l","व":"v","श":"sh","ष":"sh","स":"s","ह":"h","ं":"n","ँ":"n","ि":"i","ी":"ee","ु":"u","ू":"oo","े":"e","ै":"ai","ो":"o","ौ":"au","्":""};
const AR = {"ا":"a","آ":"aa","ع":"a","ر":"r","ز":"z","و":"v","ی":"i","ي":"i","س":"s","ج":"j","د":"d","ش":"sh","خ":"kh","ه":"h","ح":"h","ن":"n","ک":"k","ل":"l","م":"m","ب":"b","ت":"t","پ":"p","گ":"g","ں":"n","ء":""};
export function normalizeVoiceText(value) {
  return [...String(value || "").toLowerCase().normalize("NFKC")].map(c => DEV[c] ?? AR[c] ?? c).join("")
    .replace(/[’']/g,"").replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();
}
function similarity(a,b) {
  if(a===b)return 1; const row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){let diagonal=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,diagonal+(a[i-1]===b[j-1]?0:1));diagonal=old;}}
  return 1-row[b.length]/Math.max(a.length,b.length,1);
}
export function findWakeWord(text) {
  const normalized=normalizeVoiceText(text), words=normalized.split(" "), aliases=WAKE_WORD_ALIASES.map(normalizeVoiceText);
  let best={heard:false,score:0,alias:null,command:normalized,index:-1,count:1};
  for(let i=0;i<words.length;i++)for(const alias of aliases){const count=alias.split(" ").length,candidate=words.slice(i,i+count).join(" "),score=similarity(candidate,alias);if(score>best.score)best={heard:score>=WAKE_WORD_SIMILARITY,score,alias,command:normalized,index:i,count};}
  if(!best.heard)return best; words.splice(best.index,best.count); return {...best,command:words.join(" ").trim()};
}
export function parseFollowupAction(text) {
 const v=normalizeVoiceText(text);
 if(/^(on|on kar do|chalu|chalu kar do|chalao|chala do|start|start karo|jala do|jalao)$/.test(v))return "on";
 if(/^(off|off kar do|band|bandh|band kar do|bandh kar do|stop|stop karo|bujha do|bujhao)$/.test(v))return "off";
 return null;
}
export function detectExplicitAction(text) {
 const v=normalizeVoiceText(text),on=/\b(on|chalu|chalao|chala do|start|jala do|jalao|kholo)\b/.test(v),off=/\b(off|band|bandh|stop|bujha do|bujhao)\b/.test(v);
 return on===off?null:on?"on":"off";
}
export function hasConflictingExplicitActions(text) {
 const v=normalizeVoiceText(text);return /\b(on|chalu|chalao|chala do|start|jala do|jalao|kholo)\b/.test(v)&&/\b(off|band|bandh|stop|bujha do|bujhao)\b/.test(v);
}
export function parseDeterministicVoiceCommand(text,catalog) {
 const v=normalizeVoiceText(text),action=detectExplicitAction(v);if(!action||hasConflictingExplicitActions(v))return null;
 if(/\b(sari|saari|sab|all)\b/.test(v)&&/\b(light|lights|batti|bulb)\b/.test(v))return {kind:"command",actionConfidence:"high",actions:[{sceneId:action==="on"?"all_lights_on":"all_lights_off",action}],reply:""};
 const aliases={light:["light","lights","batti","bulb"],fan:["fan","pankha","pankhaa"],led:["led"]};
 const matches=(catalog?.devices||[]).filter(d=>{
  const names=[d.name,d.type,...(d.aliases||[])].map(normalizeVoiceText).filter(Boolean);
  return names.some(n=>v.includes(n))||(aliases[d.type]||[]).some(a=>new RegExp("\\b"+a+"\\b").test(v));
 });
 const unique=[...new Map(matches.map(d=>[d.id,d])).values()];
 if(unique.length===1)return {kind:"command",actionConfidence:"high",actions:[{deviceId:unique[0].id,action}],reply:""};
 if(unique.length>1)return {kind:"command",actionConfidence:"low",actions:[],clarification:"Kaunsi device? "+unique.map(d=>d.name).join(", ")};
 return null;
}
export function isVoiceSessionActive(lastMessageAt,now=new Date(),idleMinutes=15){return Boolean(lastMessageAt)&&now.getTime()-new Date(lastMessageAt).getTime()<=idleMinutes*60000;}
export function toInlineVoiceCommands(claimed){return (claimed||[]).map(c=>({commandId:c.commandId,relayNumber:c.relayNumber,action:c.action,ttlRemainingMs:c.ttlRemainingMs}));}
export function makeVoiceResponseData(controller,values,serverMs,timingsMs){return {esp32DeviceId:controller.esp32DeviceId,transcript:values.transcript||"",execution:values.execution,reason:values.reason||"",reply:values.reply||"",commands:values.commands||[],serverMs,timingsMs,provider:values.provider||"groq",sttLanguage:values.sttLanguage||null,wakeWordScore:Number(values.wakeWordScore||0),...(values.details?{details:values.details}:{})};}
export function resolveClarificationFollowup(text,pending,now=new Date()){if(!pending?.createdAt||(!pending.deviceId&&!pending.sceneId))return null;const age=now.getTime()-new Date(pending.createdAt).getTime();if(age<0||age>30000)return null;const action=parseFollowupAction(text);if(!action)return null;return {action,...(pending.deviceId?{deviceId:pending.deviceId}:{sceneId:pending.sceneId})};}
