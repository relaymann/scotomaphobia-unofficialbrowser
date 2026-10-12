import * as THREE from "three";
import { io } from "socket.io-client";
import "./style.css";
import { buildWorld, type BuiltWorld, type LayerId, type WorldItem } from "./world";
type Checkpoint={layer:LayerId;x:number;y:number;z:number};
type RunSave={version:2;layer:LayerId;collected:string[];openedGates:string[];codeSolved:boolean;clues:Record<string,number>;checkpoint:Checkpoint;completed:boolean;deaths:number;startedAt:number;elapsedSeconds:number};
type SharedEvent={type:"collect"|"gate"|"code"|"complete"|"layer"|"reset";id:string;layer:LayerId;digit?:number};

const root=document.querySelector<HTMLDivElement>("#scene")!,intro=document.querySelector<HTMLElement>("#intro")!,hud=document.querySelector<HTMLElement>("#hud")!;
const startButton=document.querySelector<HTMLButtonElement>("#start")!,status=document.querySelector<HTMLElement>("#status")!,objective=document.querySelector<HTMLElement>("#objective")!;
const objectiveList=document.querySelector<HTMLElement>("#objectiveList")!,prompt=document.querySelector<HTMLElement>("#prompt")!,toastBox=document.querySelector<HTMLElement>("#toast")!;
const overlay=document.querySelector<HTMLElement>("#puzzleOverlay")!,puzzleTitle=document.querySelector<HTMLElement>("#puzzleTitle")!,puzzleDescription=document.querySelector<HTMLElement>("#puzzleDescription")!;
const puzzleBody=document.querySelector<HTMLElement>("#puzzleBody")!,puzzleHint=document.querySelector<HTMLElement>("#puzzleHint")!,pauseScreen=document.querySelector<HTMLElement>("#pauseScreen")!;
const endScreen=document.querySelector<HTMLElement>("#endScreen")!,timerLabel=document.querySelector<HTMLElement>("#timer")!,layerLabel=document.querySelector<HTMLElement>("#layerLabel")!;
const interactButton=document.querySelector<HTMLButtonElement>("#interact")!;
const roomInput=document.querySelector<HTMLInputElement>("#roomCode")!;
const newRoomButton=document.querySelector<HTMLButtonElement>("#newRoom")!;
const copyRoomButton=document.querySelector<HTMLButtonElement>("#copyRoom")!;
const activeRoomCode=document.querySelector<HTMLElement>("#activeRoomCode")!;
const ROOM_KEY="scotomaphobia-room-code";
function createRoomCode(){return Math.random().toString(36).slice(2,8).toUpperCase().padEnd(6,"X");}
function restoreRoomCode(){
  try{const existing=localStorage.getItem(ROOM_KEY)?.toUpperCase();if(existing&&/^[A-Z0-9]{6}$/.test(existing))return existing;
    const generated=createRoomCode();localStorage.setItem(ROOM_KEY,generated);return generated;
  }catch{return createRoomCode();}
}
let roomCode=restoreRoomCode();
roomInput.value=roomCode;activeRoomCode.textContent=roomCode;
const saveSlotKey=()=> "scotomaphobia-run-v2:"+roomCode;
const scene=new THREE.Scene();scene.background=new THREE.Color("#111713");scene.fog=new THREE.FogExp2("#111713",0.018);
const camera=new THREE.PerspectiveCamera(74,innerWidth/innerHeight,0.08,220);camera.rotation.order="YXZ";
const renderer=new THREE.WebGLRenderer({antialias:innerWidth>800,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1.25:1.6));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;root.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight("#9caea7","#151514",0.27));
const moon=new THREE.DirectionalLight("#a9b9ac",0.32);moon.position.set(-10,22,7);scene.add(moon);

const freshSave=():RunSave=>({version:2,layer:1,collected:[],openedGates:[],codeSolved:false,clues:{},checkpoint:{layer:1,x:0,y:1.65,z:12},completed:false,deaths:0,startedAt:Date.now(),elapsedSeconds:0});
function readSave(storageKey:string):RunSave{
  try{
    const raw=localStorage.getItem(storageKey);
    if(!raw)return freshSave();
    const p=JSON.parse(raw) as Partial<RunSave>;
    if(p.version!==2||(p.layer!==1&&p.layer!==2)||!Array.isArray(p.collected)||!Array.isArray(p.openedGates))return freshSave();
    const base=freshSave(),cp=p.checkpoint;
    const checkpoint=cp&&(cp.layer===1||cp.layer===2)&&Number.isFinite(cp.x)&&Number.isFinite(cp.y)&&Number.isFinite(cp.z)?{layer:cp.layer,x:cp.x,y:cp.y,z:cp.z}:base.checkpoint;
    return {...base,...p,version:2,layer:p.layer,collected:p.collected.filter((v):v is string=>typeof v==="string").slice(0,128),
      openedGates:p.openedGates.filter((v):v is string=>typeof v==="string").slice(0,32),clues:p.clues&&typeof p.clues==="object"?p.clues:{},checkpoint,
      codeSolved:p.codeSolved===true,completed:p.completed===true,
      deaths:Number.isFinite(p.deaths)?Math.max(0,Math.min(9999,Number(p.deaths))):0,
      elapsedSeconds:Number.isFinite(p.elapsedSeconds)?Math.max(0,Math.min(864000,Number(p.elapsedSeconds))):0,
      startedAt:Number.isFinite(p.startedAt)?Number(p.startedAt):Date.now()};
  }catch{return freshSave();}
}
let save=readSave(saveSlotKey()),elapsedBase=save.elapsedSeconds,sessionStartedAt=0,world:BuiltWorld|null=null;
let socket:ReturnType<typeof io>|undefined;
const remotes=new Map<string,THREE.Mesh>(),keys=new Set<string>();
let active=false,paused=false,locked=false,yaw=0,pitch=0,playerX=0,playerZ=12,feetY=0,verticalVelocity=0,onGround=true;
let lookPointer:number|null=null,lastMouseX=0,lastMouseY=0,joyX=0,joyY=0,stickPointer=-1;
let puzzleMode:"cipher"|"note"|null=null,codeInput="";
let toastTimer=0,previousFrameTime=performance.now(),lastUiSecond=-1,lastHazardAt=0;

function elapsedSeconds(){return elapsedBase+(active&&!paused&&sessionStartedAt?Math.max(0,Math.floor((Date.now()-sessionStartedAt)/1000)):0);}
function elapsedText(){const s=elapsedSeconds();return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");}
function saveRun(){save.elapsedSeconds=elapsedSeconds();try{localStorage.setItem(saveSlotKey(),JSON.stringify(save));}catch{status.textContent="LOCAL SAVE UNAVAILABLE";}}
function has(id:string){return save.collected.includes(id);}
function addUnique(list:string[],value:string){if(!list.includes(value))list.push(value);}
function removeCollider(c:THREE.Box3|undefined){if(!c||!world)return;const i=world.colliders.indexOf(c);if(i>=0)world.colliders.splice(i,1);}
function toast(message:string){toastBox.textContent=message;toastBox.classList.add("visible");window.clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>toastBox.classList.remove("visible"),2700);}
function disposeWorld(){
  if(!world)return;scene.remove(world.root);
  world.root.traverse(obj=>{const mesh=obj as THREE.Mesh;if(mesh.geometry)mesh.geometry.dispose();if(mesh.material){if(Array.isArray(mesh.material))mesh.material.forEach(m=>m.dispose());else mesh.material.dispose();}});
  world=null;
  for(const mesh of remotes.values()){scene.remove(mesh);mesh.geometry.dispose();if(Array.isArray(mesh.material))mesh.material.forEach(m=>m.dispose());else mesh.material.dispose();}remotes.clear();
}
function syncWorldVisuals(){
  if(!world)return;
  for(const item of world.items){
    if(has(item.id)&&item.kind!=="cipher")item.object.visible=false;
    if((item.kind==="finish"||item.kind==="house-door"||item.kind==="white-door")&&save.openedGates.includes(item.id)){removeCollider(item.blocker);if(item.leaf)item.leaf.visible=false;item.object.visible=false;}
  }
  if(world.stalker)world.stalker.visible=world.layer===2&&save.collected.filter(x=>x.startsWith("l2-crystal-")).length>=3;
}
function installWorld(layer:LayerId,restoreCheckpoint=true){
  disposeWorld();world=buildWorld(layer);scene.add(world.root);save.layer=layer;
  scene.background=new THREE.Color(layer===1?"#111713":"#080d0f");scene.fog=new THREE.FogExp2(layer===1?"#111713":"#080d0f",layer===1?0.018:0.024);
  const cp=restoreCheckpoint&&save.checkpoint.layer===layer?save.checkpoint:world.spawn;
  playerX=cp.x;playerZ=cp.z;feetY=cp.y-1.65;verticalVelocity=0;onGround=true;yaw=0;pitch=0;
  syncWorldVisuals();camera.position.set(playerX,feetY+1.65,playerZ);camera.rotation.set(pitch,yaw,0,"YXZ");updateHud();saveRun();
}
function countPrefix(prefix:string){return save.collected.filter(id=>id.startsWith(prefix)).length;}
function updateHud(){
  if(!world)return;layerLabel.textContent=world.layer===1?"LAYER 1  /  THE THRESHOLD":"LAYER 2  /  THE MONOLITH FIELD";
  if(save.completed)objective.textContent="The way out is open. The expedition is complete.";
  else if(world.layer===1){
    if(countPrefix("l1-orb-")<7)objective.textContent="Explore the island and recover seven pale orbs. Search the house, bridge, hidden ledge and graveyard.";
    else if(!save.openedGates.includes("l1-white-door"))objective.textContent="All seven orbs are gathered. Return to the white door in the middle of the island.";
    else objective.textContent="The white door is open. Enter the cave, read the last journal note if you want the full story, then use the elevator.";
  }else{
    if(countPrefix("l2-crystal-")<7)objective.textContent="Find all seven pale crystals scattered around the monolith field.";
    else if(countPrefix("l2-clue-")<4)objective.textContent="Read all four inscriptions to learn the seal code.";
    else if(!save.codeSolved)objective.textContent="Enter the four-digit inscription code at the seal terminal.";
    else objective.textContent="Reach the final gate and escape the monolith field.";
  }
  const tasks=world.layer===1?[
    {done:countPrefix("l1-note-")>=9,text:"Journal notes  "+countPrefix("l1-note-")+"/9"},
    {done:has("l1-house-key"),text:"Find the buried house key"},
    {done:countPrefix("l1-orb-")>=7,text:"Pale orbs  "+countPrefix("l1-orb-")+"/7"},
    {done:save.openedGates.includes("l1-house-door"),text:"Unlock the house"},
    {done:save.openedGates.includes("l1-white-door"),text:"Open the white door"},
    {done:save.layer===2,text:"Descend by elevator"}
  ]:[
    {done:countPrefix("l2-crystal-")>=7,text:"Pale crystals  "+countPrefix("l2-crystal-")+"/7"},
    {done:countPrefix("l2-clue-")>=4,text:"Inscriptions  "+countPrefix("l2-clue-")+"/4"},
    {done:save.codeSolved,text:"Seal code accepted"},{done:save.completed,text:"Escape the monolith field"}
  ];
  objectiveList.innerHTML=tasks.map(t=>"<div class=\"task "+(t.done?"done":"")+"\"><i>"+(t.done?"✓":"·")+"</i><span>"+t.text+"</span></div>").join("");
  startButton.textContent=save.completed?"START A NEW EXPEDITION":(save.collected.length||save.codeSolved||save.layer===2?"CONTINUE EXPEDITION":"ENTER THE WOODS ↗");
}
function floorAt(x:number,z:number):number|undefined{if(!world)return undefined;let top:number|undefined;for(const f of world.floors)if(x>=f.minX&&x<=f.maxX&&z>=f.minZ&&z<=f.maxZ&&(top===undefined||f.y>top))top=f.y;return top;}
function sendEvent(event:SharedEvent){if(socket?.connected)socket.emit("game:event",event);}
function openGate(id:string,broadcast=true){
  if(!world)return;const item=world.items.find(i=>i.id===id);addUnique(save.openedGates,id);
  if(item){removeCollider(item.blocker);if(item.leaf)item.leaf.visible=false;item.object.visible=false;}
  if(broadcast)sendEvent({type:"gate",id,layer:save.layer});saveRun();updateHud();
}
function collectItem(item:WorldItem){
  addUnique(save.collected,item.id);if(item.kind==="clue"&&typeof item.digit==="number")save.clues[item.id]=item.digit;
  item.object.visible=false;sendEvent({type:"collect",id:item.id,layer:save.layer,digit:item.digit});saveRun();syncWorldVisuals();updateHud();
}
function applySharedEvent(event:SharedEvent){
  if(!event||!(event.layer===1||event.layer===2)||typeof event.id!=="string")return;
  if(event.type==="reset"&&event.id==="expedition-reset"){
    save=freshSave();elapsedBase=0;sessionStartedAt=active?Date.now():0;paused=false;
    pauseScreen.classList.remove("visible");overlay.classList.remove("visible");endScreen.classList.remove("visible");puzzleMode=null;
    installWorld(1,false);updateHud();
    if(active){intro.classList.add("hidden");hud.classList.add("visible");}
    toast("The co-op room has started a fresh expedition.");return;
  }
  if(event.type==="layer"&&event.id==="layer-2-entry"){
    if(save.layer!==2){save.layer=2;save.checkpoint={layer:2,x:0,y:1.65,z:12};installWorld(2,false);toast("Your expedition has descended with the group.");}
    return;
  }
  if(event.type==="collect"){addUnique(save.collected,event.id);if(typeof event.digit==="number"&&event.digit>=1&&event.digit<=9)save.clues[event.id]=event.digit;}
  else if(event.type==="gate")addUnique(save.openedGates,event.id);
  else if(event.type==="code")save.codeSolved=true;
  else if(event.type==="complete"){finishRun(false);return;}
  if(world&&world.layer===event.layer){if(event.type==="gate"){const item=world.items.find(i=>i.id===event.id);if(item){removeCollider(item.blocker);if(item.leaf)item.leaf.visible=false;}}syncWorldVisuals();}
  saveRun();updateHud();
}
function connect(resetRoom=false){
  const url=(import.meta.env.VITE_SERVER_URL as string|undefined)?.trim();if(!url){status.textContent="SOLO / LOCAL SAVE";return;}
  if(socket){socket.disconnect();socket=undefined;}socket=io(url,{query:{room:roomCode,reset:resetRoom?"1":"0"},transports:["websocket","polling"],timeout:7000,reconnection:true});
  socket.on("connect",()=>status.textContent="MULTIPLAYER CONNECTED");socket.on("disconnect",()=>status.textContent="RECONNECTING");socket.on("connect_error",()=>status.textContent="SOLO MODE");
  socket.on("players:state",(list:{id:string;x:number;y:number;z:number;yaw:number;layer?:number}[])=>{
    if(!socket)return;const seen=new Set<string>();
    for(const p of list){if(p.id===socket.id||p.layer!==save.layer)continue;seen.add(p.id);let mesh=remotes.get(p.id);
      if(!mesh){mesh=new THREE.Mesh(new THREE.CapsuleGeometry(.34,1,4,8),new THREE.MeshStandardMaterial({color:"#a8b9ac",roughness:.8}));scene.add(mesh);remotes.set(p.id,mesh);}
      mesh.position.set(p.x,p.y-.8,p.z);mesh.rotation.y=p.yaw;}
    for(const [id,mesh] of remotes)if(!seen.has(id)){scene.remove(mesh);mesh.geometry.dispose();if(Array.isArray(mesh.material))mesh.material.forEach(m=>m.dispose());else mesh.material.dispose();remotes.delete(id);}
  });
  socket.on("game:events",(events:SharedEvent[])=>{if(Array.isArray(events))events.forEach(applySharedEvent);});socket.on("game:event",(event:SharedEvent)=>applySharedEvent(event));
}
function respawn(message="You fell into the dark. Checkpoint restored."){
  save.deaths++;playerX=save.checkpoint.x;playerZ=save.checkpoint.z;feetY=save.checkpoint.y-1.65;verticalVelocity=0;onGround=true;yaw=0;pitch=0;
  if(world?.stalker)world.stalker.position.set(0,0,world.layer===1?-113:-35);
  camera.position.set(playerX,feetY+1.65,playerZ);saveRun();updateHud();toast(message);
}
function openOverlay(title:string,description:string,body:string,mode:"cipher"|"note"){
  puzzleMode=mode;puzzleTitle.textContent=title;puzzleDescription.textContent=description;puzzleBody.innerHTML=body;puzzleHint.textContent="";overlay.classList.add("visible");if(document.pointerLockElement)document.exitPointerLock();
}
function showNote(item:WorldItem){
  puzzleMode="note";puzzleTitle.textContent=item.label.toUpperCase();puzzleDescription.textContent="FIELD JOURNAL / LAYER 1";puzzleBody.innerHTML="";
  const paper=document.createElement("article");paper.className="note-paper";
  const text=document.createElement("p");text.textContent="“"+item.description+"”";paper.appendChild(text);puzzleBody.appendChild(paper);
  puzzleHint.textContent="NOTE ADDED TO JOURNAL · CLOSE TO CONTINUE";overlay.classList.add("visible");
  if(document.pointerLockElement)document.exitPointerLock();
}
function closePuzzle(){overlay.classList.remove("visible");puzzleMode=null;puzzleBody.innerHTML="";if(active&&!paused&&innerWidth>700)renderer.domElement.requestPointerLock?.();}
puzzleBody.addEventListener("click",event=>{
  const target=event.target as HTMLElement;
  const button=target.closest<HTMLButtonElement>("[data-key]");
  if(!button||puzzleMode!=="cipher")return;
  const key=button.dataset.key;
  if(key==="clear")codeInput=codeInput.slice(0,-1);
  else if(key==="enter"){
    if(codeInput==="2714"){
      save.codeSolved=true;openGate("l2-finish-gate");sendEvent({type:"code",id:"l2-seal-code",layer:2});
      saveRun();closePuzzle();updateHud();toast("The terminal accepts the code. The final gate opens.");
    }else{puzzleHint.textContent="Incorrect sequence. Recheck the inscriptions.";codeInput="";}
  }else if(key&&/^[0-9]$/.test(key)&&codeInput.length<4)codeInput+=key;
  const display=document.querySelector<HTMLElement>("#codeDisplay");
  if(display)display.textContent=(codeInput+"____").slice(0,4).split("").join(" ");
});
document.querySelector("#puzzleClose")!.addEventListener("click",closePuzzle);
function nearestItem():WorldItem|undefined{
  if(!world)return undefined;let nearest:WorldItem|undefined,distance=Infinity;
  for(const item of world.items){if(!item.object.visible)continue;if(["house-door","white-door","finish"].includes(item.kind)&&save.openedGates.includes(item.id))continue;
    const d=Math.hypot(playerX-item.position.x,feetY+1.2-item.position.y,playerZ-item.position.z);if(d<item.radius&&d<distance){nearest=item;distance=d;}}
  return nearest;
}
function interact(){
  if(!active||paused||puzzleMode||save.completed||!world)return;
  const item=nearestItem();if(!item){toast("Nothing close enough to interact with.");return;}
  if(item.kind==="note"){if(!has(item.id))collectItem(item);showNote(item);return;}
  if(item.kind==="orb"||item.kind==="crystal"||item.kind==="clue"){
    if(has(item.id)){toast("You already recovered this.");return;}
    if(item.kind==="clue")toast(item.description);else toast(item.kind==="orb"?"Pale orb recovered.":"Pale crystal recovered.");
    collectItem(item);return;
  }
  if(item.kind==="house-key"){if(!has(item.id)){collectItem(item);toast("House key recovered. You can now unlock the house.");}else toast("You already recovered the house key.");return;}
  if(item.kind==="house-door"){
    if(save.openedGates.includes(item.id)){toast("The house door is already open.");return;}
    if(!has("l1-house-key")){toast("The note says the key is buried with the artist. Search behind the graveyard statue.");return;}
    openGate(item.id);toast("The house door creaks open.");return;
  }
  if(item.kind==="white-door"){
    const orbs=countPrefix("l1-orb-");if(save.openedGates.includes(item.id)){toast("The white door stands open.");return;}
    if(orbs<7){toast("The white door needs seven pale orbs ("+orbs+"/7).");return;}
    openGate(item.id);toast("Seven orbs flare and the white door opens into the cave.");return;
  }
  if(item.kind==="elevator"){if(!save.openedGates.includes("l1-white-door")){toast("The cave entrance is still sealed by the white door.");return;}changeLayer(2);return;}
  if(item.kind==="cipher"){
    const crystals=countPrefix("l2-crystal-"),clues=countPrefix("l2-clue-");
    if(crystals<7){toast("The seal needs all seven pale crystals ("+crystals+"/7).");return;}
    if(clues<4){toast("Find all four inscription marks ("+clues+"/4).");return;}if(save.codeSolved){toast("The seal code is already accepted.");return;}openCipher();return;}
  if(item.kind==="finish"){if(!save.codeSolved){toast("The final gate is still sealed.");return;}finishRun();return;}
}
function changeLayer(layer:LayerId){if(layer===2)sendEvent({type:"layer",id:"layer-2-entry",layer:2});save.layer=layer;save.checkpoint={layer,x:0,y:1.65,z:12};installWorld(layer,false);toast("The monolith field stretches into the dark.");saveRun();}
function finishRun(broadcast=true){
  if(save.completed)return;
  save.elapsedSeconds=elapsedSeconds();elapsedBase=save.elapsedSeconds;sessionStartedAt=0;save.completed=true;active=false;paused=false;
  if(broadcast)sendEvent({type:"complete",id:"expedition-complete",layer:save.layer});
  saveRun();hud.classList.remove("visible");pauseScreen.classList.remove("visible");endScreen.classList.add("visible");
  document.querySelector<HTMLElement>("#endStats")!.textContent="TIME  "+elapsedText()+"     FALLS  "+save.deaths;if(document.pointerLockElement)document.exitPointerLock();
}
roomInput.addEventListener("input",()=>{roomInput.value=roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6);});
newRoomButton.addEventListener("click",()=>{roomInput.value=createRoomCode();roomInput.focus();toastBox.classList.remove("visible");});
copyRoomButton.addEventListener("click",async()=>{
  try{await navigator.clipboard.writeText(roomCode);toast("Room code copied. Give it to the people joining your expedition.");}
  catch{roomInput.value=roomCode;roomInput.focus();roomInput.select();toast("Select and copy the room code from the field.");}
});
startButton.addEventListener("click",()=>{
  const requested=roomInput.value.trim().toUpperCase();
  if(!/^[A-Z0-9]{6}$/.test(requested)){toast("Room codes must be six letters or numbers.");return;}
  if(requested!==roomCode){
    saveRun();roomCode=requested;
    try{localStorage.setItem(ROOM_KEY,roomCode);}catch{}
    save=readSave(saveSlotKey());elapsedBase=save.elapsedSeconds;sessionStartedAt=0;activeRoomCode.textContent=roomCode;installWorld(save.layer,true);
  }
  const resetExistingRun=save.completed;
  if(resetExistingRun){save=freshSave();elapsedBase=0;sessionStartedAt=Date.now();installWorld(1,false);}
  if(!sessionStartedAt){elapsedBase=save.elapsedSeconds;sessionStartedAt=Date.now();}
  active=true;paused=false;intro.classList.add("hidden");hud.classList.add("visible");connect(resetExistingRun);updateHud();if(innerWidth>700)renderer.domElement.requestPointerLock?.();
});
document.querySelector("#resume")!.addEventListener("click",()=>{if(active&&!save.completed)sessionStartedAt=Date.now();paused=false;pauseScreen.classList.remove("visible");if(active&&innerWidth>700)renderer.domElement.requestPointerLock?.();});
document.querySelector("#pauseRestart")!.addEventListener("click",()=>{
  save=freshSave();elapsedBase=0;sessionStartedAt=Date.now();active=true;paused=false;pauseScreen.classList.remove("visible");installWorld(1,false);updateHud();connect(true);
  if(innerWidth>700)renderer.domElement.requestPointerLock?.();
});
document.querySelector("#replay")!.addEventListener("click",()=>{
  save=freshSave();elapsedBase=0;sessionStartedAt=Date.now();active=true;paused=false;endScreen.classList.remove("visible");installWorld(1,false);connect(true);
  intro.classList.add("hidden");hud.classList.add("visible");updateHud();
  if(innerWidth>700)renderer.domElement.requestPointerLock?.();
});
document.addEventListener("pointerlockchange",()=>locked=document.pointerLockElement===renderer.domElement);
document.addEventListener("mousemove",e=>{if(active&&!paused&&locked&&!puzzleMode){yaw-=e.movementX*.0022;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0022,-1.18,1.18);}});
renderer.domElement.addEventListener("click",()=>{if(active&&!paused&&innerWidth>700&&!locked&&!puzzleMode)renderer.domElement.requestPointerLock?.();});
document.addEventListener("keydown",e=>{
  if(e.code==="Escape"){if(puzzleMode){closePuzzle();e.preventDefault();return;}if(active&&!save.completed){
    if(!paused){elapsedBase=elapsedSeconds();sessionStartedAt=0;saveRun();}
    else sessionStartedAt=Date.now();
    paused=!paused;pauseScreen.classList.toggle("visible",paused);
    if(paused&&document.pointerLockElement)document.exitPointerLock();else if(!paused&&innerWidth>700)renderer.domElement.requestPointerLock?.();
  }return;}
  if(e.code==="KeyE"||e.code==="Enter"){if(!puzzleMode)interact();return;}
  if(e.code==="Space"&&!e.repeat)keys.add("jump-pressed");keys.add(e.code);
});
document.addEventListener("keyup",e=>keys.delete(e.code));
window.addEventListener("blur",()=>{keys.clear();joyX=joyY=0;stickPointer=-1;lookPointer=null;});
window.addEventListener("pagehide",saveRun);
const stick=document.querySelector<HTMLElement>("#stick")!,knob=stick.querySelector<HTMLElement>("i")!;
stick.addEventListener("pointerdown",e=>{e.preventDefault();stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);});
stick.addEventListener("pointermove",e=>{
  if(e.pointerId!==stickPointer)return;const r=stick.getBoundingClientRect();joyX=THREE.MathUtils.clamp((e.clientX-r.left-r.width/2)/(r.width*.38),-1,1);
  joyY=THREE.MathUtils.clamp((e.clientY-r.top-r.height/2)/(r.height*.38),-1,1);knob.style.transform="translate("+joyX*24+"px,"+joyY*24+"px)";
});
function releaseStick(e:PointerEvent){if(e.pointerId===stickPointer){stickPointer=-1;joyX=joyY=0;knob.style.transform="";}}
stick.addEventListener("pointerup",releaseStick);stick.addEventListener("pointercancel",releaseStick);
renderer.domElement.addEventListener("pointerdown",e=>{if(e.pointerType==="touch"&&active&&!paused&&e.clientX>innerWidth*.38){lookPointer=e.pointerId;lastMouseX=e.clientX;lastMouseY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId);}});
renderer.domElement.addEventListener("pointermove",e=>{
  if(e.pointerType!=="touch"||e.pointerId!==lookPointer||paused||puzzleMode)return;
  yaw-=(e.clientX-lastMouseX)*.004;pitch=THREE.MathUtils.clamp(pitch-(e.clientY-lastMouseY)*.004,-1.12,1.12);lastMouseX=e.clientX;lastMouseY=e.clientY;
});
renderer.domElement.addEventListener("pointerup",e=>{if(e.pointerId===lookPointer)lookPointer=null;});
renderer.domElement.addEventListener("pointercancel",e=>{if(e.pointerId===lookPointer)lookPointer=null;});
interactButton.addEventListener("pointerdown",e=>{e.preventDefault();interact();});
function updateStalker(dt:number){
  if(!world?.stalker||!active||paused||puzzleMode||save.completed||!world.stalker.visible)return;
  const monster=world.stalker,dx=playerX-monster.position.x,dz=playerZ-monster.position.z,distance=Math.hypot(dx,dz);if(distance>38)return;
  const lookX=-Math.sin(yaw),lookZ=-Math.cos(yaw),toX=monster.position.x-playerX,toZ=monster.position.z-playerZ;
  const facing=distance>.01?(lookX*toX+lookZ*toZ)/distance:1;
  if(facing<.48&&distance>1.7){const speed=world.layer===1?1.35:1.65;monster.position.x+=dx/distance*speed*dt;monster.position.z+=dz/distance*speed*dt;monster.rotation.y=Math.atan2(dx,dz);}
  if(distance<1.55)respawn("Something found you. Your checkpoint is safe, for now.");
}
function frame(now:number){
  requestAnimationFrame(frame);const dt=Math.min((now-previousFrameTime)/1000,.05);previousFrameTime=now;
  if(active&&!paused&&!puzzleMode&&!save.completed&&world){
    const forward=(keys.has("KeyW")||keys.has("ArrowUp")?1:0)-(keys.has("KeyS")||keys.has("ArrowDown")?1:0)-joyY;
    const strafe=(keys.has("KeyD")||keys.has("ArrowRight")?1:0)-(keys.has("KeyA")||keys.has("ArrowLeft")?1:0)+joyX;
    let dx=-Math.sin(yaw)*forward+Math.cos(yaw)*strafe,dz=-Math.cos(yaw)*forward-Math.sin(yaw)*strafe;
    const magnitude=Math.hypot(dx,dz);if(magnitude>1){dx/=magnitude;dz/=magnitude;}
    const speed=keys.has("ShiftLeft")||keys.has("ShiftRight")?6.1:4.25;
    const boxFor=(x:number,z:number)=>new THREE.Box3(new THREE.Vector3(x-.3,feetY+.04,z-.3),new THREE.Vector3(x+.3,feetY+1.7,z+.3));
    const nextX=playerX+dx*speed*dt,nextZ=playerZ+dz*speed*dt;
    if(!world.colliders.some(c=>c.intersectsBox(boxFor(nextX,playerZ))))playerX=nextX;
    if(!world.colliders.some(c=>c.intersectsBox(boxFor(playerX,nextZ))))playerZ=nextZ;
    if(keys.has("jump-pressed")){if(onGround){verticalVelocity=7.25;onGround=false;}keys.delete("jump-pressed");}
    const hazard=world.hazards.find(h=>playerX>=h.minX&&playerX<=h.maxX&&playerZ>=h.minZ&&playerZ<=h.maxZ);
    if(hazard&&now-lastHazardAt>1300){
      lastHazardAt=now;playerX=hazard.targetX;playerZ=hazard.targetZ;feetY=0;verticalVelocity=0;onGround=true;
      camera.position.set(playerX,feetY+1.65,playerZ);toast(hazard.message);
    }
    const ground=floorAt(playerX,playerZ);if(ground===undefined&&onGround){onGround=false;verticalVelocity=-.5;}
    verticalVelocity-=18*dt;feetY+=verticalVelocity*dt;
    if(ground!==undefined&&feetY<=ground&&verticalVelocity<=0){feetY=ground;verticalVelocity=0;onGround=true;}else onGround=false;
    if(feetY < -7)respawn();
    camera.position.set(playerX,feetY+1.65,playerZ);camera.rotation.set(pitch,yaw,0,"YXZ");
    const nearest=nearestItem();prompt.textContent=nearest?"[E]  "+nearest.label:"";
    if(socket?.connected)socket.emit("player:move",{x:playerX,y:feetY+1.65,z:playerZ,yaw,layer:save.layer});
    updateStalker(dt);const seconds=Math.floor(elapsedSeconds());if(seconds!==lastUiSecond){timerLabel.textContent=elapsedText();lastUiSecond=seconds;}
    if(now%5000<40)saveRun();
  }
  renderer.render(scene,camera);
}
installWorld(save.layer,true);timerLabel.textContent=elapsedText();updateHud();requestAnimationFrame(frame);
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1.25:1.6));});
