import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app=express();app.disable("x-powered-by");app.use(express.json({limit:"32kb"}));
const origins=(process.env.CLIENT_ORIGIN??"http://localhost:5173").split(",").map(s=>s.trim()).filter(Boolean);
app.use(cors({origin(origin,cb){if(!origin||origins.includes("*")||origins.includes(origin))cb(null,true);else cb(new Error("Origin not allowed"));}}));
const http=createServer(app);
const io=new Server(http,{cors:{origin:origins.includes("*")?"*":origins,methods:["GET","POST"]},maxHttpBufferSize:100000,pingInterval:25000,pingTimeout:20000});
type Layer=1|2;
type Player={id:string;room:string;x:number;y:number;z:number;yaw:number;layer:Layer;updatedAt:number;lastPacketAt:number};
type SharedEvent={type:"collect"|"gate"|"code"|"complete"|"layer"|"reset";id:string;layer:Layer;digit?:number};
const players=new Map<string,Player>(),roomEvents=new Map<string,Map<string,SharedEvent>>(),roomHosts=new Map<string,string>();
const itemPositions:Record<string,{layer:Layer;x:number;y:number;z:number;digit?:number}>={
"l1-house-key":{layer:1,x:21,y:-1.8,z:-41},
"l1-house-door":{layer:1,x:-18,y:1.2,z:-31},
"l1-white-door":{layer:1,x:0,y:1.2,z:-63},
"l1-elevator":{layer:1,x:0,y:1.2,z:-88},
"l2-cipher-terminal":{layer:2,x:0,y:1.2,z:-52},
"l2-finish-gate":{layer:2,x:0,y:1.2,z:-60},
...Array.from({length:9},(_,i)=>{const positions:[number,number,number][]=[[-28,-2,0],[-26,-35,0],[0,-36.8,0],[18,1,-1.8],[24,-41,-3],[9,-49,0],[-18,-22,0],[19,-42,-3],[-2.5,-69,0]];const [x,z,y]=positions[i];return ["l1-note-"+(i+1),{layer:1 as Layer,x,y:y+1.2,z} ] as const;}),
...Array.from({length:7},(_,i)=>{const p:[number,number,number][]=[[-10,-3,0],[18,1,-1.8],[-18,-22,0],[-.8,-38.7,0],[25,-40,-3],[11,-49,0],[-1,-56,0]][i];return ["l1-orb-"+(i+1),{layer:1 as Layer,x:p[0],y:p[2]+1.2,z:p[1]}] as const;}),
...Array.from({length:7},(_,i)=>{const p:[number,number][]=[[-28,5],[28,7],[-40,-12],[40,-18],[-17,-39],[16,-38],[5,-30]][i];return ["l2-crystal-"+(i+1),{layer:2 as Layer,x:p[0],y:1.2,z:p[1]}] as const;}),
...([{id:"l2-clue-1",x:-22,z:-17,digit:2},{id:"l2-clue-2",x:21,z:-22,digit:7},{id:"l2-clue-3",x:-15,z:-45,digit:1},{id:"l2-clue-4",x:31,z:-42,digit:4}].map(v=>[v.id,{layer:2 as Layer,x:v.x,y:1.2,z:v.z,digit:v.digit}] as const))
};
const validIds=new Set([...Object.keys(itemPositions),"l2-seal-code","layer-2-entry","expedition-complete","expedition-reset"]);
function getRoomEvents(room:string){let events=roomEvents.get(room);if(!events){events=new Map<string,SharedEvent>();roomEvents.set(room,events);}return events;}
function roomPlayers(room:string){return [...players.values()].filter(p=>p.room===room);}
function snapshot(room:string){return roomPlayers(room).map(({updatedAt:_,lastPacketAt:__,room:___,...p})=>p);}
function cleanupRoom(room:string){if(roomPlayers(room).length)return;roomEvents.delete(room);roomHosts.delete(room);}
app.get("/health",(_req,res)=>res.json({ok:true,service:"scotomaphobia-realtime",players:players.size,rooms:roomEvents.size,sharedEvents:[...roomEvents.values()].reduce((n,e)=>n+e.size,0),uptimeSeconds:Math.floor(process.uptime())}));
const number=(v:unknown,min:number,max:number)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max?v:undefined;
const has=(room:string,id:string)=>getRoomEvents(room).has("collect:"+id);
const gateOpen=(room:string,id:string)=>getRoomEvents(room).has("gate:"+id);
function nearby(p:Player,id:string){const item=itemPositions[id];return !!item&&item.layer===p.layer&&Math.hypot(p.x-item.x,p.y-item.y,p.z-item.z)<=5.5;}
function accepted(p:Player,type:string,id:string,room:string,digit:unknown):boolean{
 const events=getRoomEvents(room);
 if(type==="collect"){
  const item=itemPositions[id];if(!item||item.layer!==p.layer||!nearby(p,id))return false;
  if(id==="l1-house-key"&&!events.has("collect:l1-note-8"))return false;
  if(id==="l1-orb-3"&&!gateOpen(room,"l1-house-door"))return false;
  if(id.startsWith("l2-")&&p.layer!==2)return false;
  if(id.startsWith("l2-clue-")&&typeof digit==="number"&&digit!==item.digit)return false;
  return true;
 }
 if(type==="gate"){
  if(!itemPositions[id]||!nearby(p,id))return false;
  if(id==="l1-house-door")return p.layer===1&&has(room,"l1-house-key");
  if(id==="l1-white-door")return p.layer===1&&Array.from({length:7},(_,i)=>has(room,"l1-orb-"+(i+1))).every(Boolean);
  if(id==="l2-finish-gate")return p.layer===2&&events.has("code:l2-seal-code");
 }
 if(type==="code")return id==="l2-seal-code"&&p.layer===2&&nearby(p,"l2-cipher-terminal")&&Array.from({length:7},(_,i)=>has(room,"l2-crystal-"+(i+1))).every(Boolean)&&Array.from({length:4},(_,i)=>has(room,"l2-clue-"+(i+1))).every(Boolean)&&digit==="2714";
 if(type==="layer")return id==="layer-2-entry"&&p.layer===1&&gateOpen(room,"l1-white-door")&&nearby(p,"l1-elevator");
 if(type==="complete")return id==="expedition-complete"&&p.layer===2&&gateOpen(room,"l2-finish-gate");
 return false;
}
io.on("connection",s=>{
 const requested=s.handshake.query.room,room=typeof requested==="string"&&/^[A-Z0-9]{6}$/.test(requested)?requested:"PUBLIC";
 const existing=roomPlayers(room);
 if(!roomHosts.has(room))roomHosts.set(room,s.id);
 s.join(room);
 const now=Date.now();players.set(s.id,{id:s.id,room,x:0,y:1.65,z:12,yaw:0,layer:1,updatedAt:now,lastPacketAt:0});
 const resetRequested=s.handshake.query.reset==="1";
 if(resetRequested&&(roomHosts.get(room)===s.id||existing.length===0)){getRoomEvents(room).clear();s.to(room).emit("game:event",{type:"reset",id:"expedition-reset",layer:1} satisfies SharedEvent);}
 s.emit("players:state",snapshot(room));s.emit("game:events",[...getRoomEvents(room).values()]);s.to(room).emit("players:state",snapshot(room));
 s.on("player:move",(value:unknown)=>{
  const current=players.get(s.id);if(!current||!value||typeof value!=="object")return;
  const t=Date.now();if(t-current.lastPacketAt<40)return;
  const p=value as Record<string,unknown>,x=number(p.x,-120,120),y=number(p.y,-9,40),z=number(p.z,-150,80),yaw=number(p.yaw,-Math.PI*100,Math.PI*100);
  if(x===undefined||y===undefined||z===undefined||yaw===undefined)return;
  if(p.layer!==current.layer)return;
  const dt=Math.max((t-current.updatedAt)/1000,0);
  if(Math.hypot(x-current.x,z-current.z)>7*dt+.65||Math.abs(y-current.y)>Math.max(1.8,8*dt+.65))return;
  current.lastPacketAt=t;players.set(s.id,{...current,x,y,z,yaw,updatedAt:t});
 });
 s.on("game:event",(value:unknown)=>{
  if(!value||typeof value!=="object")return;
  const v=value as Record<string,unknown>;if(typeof v.id!=="string"||!validIds.has(v.id)||(v.layer!==1&&v.layer!==2)||typeof v.type!=="string")return;
  const current=players.get(s.id);if(!current)return;
  const type=v.type,id=v.id,layer=v.layer as Layer;
  if(type==="reset"&&id==="expedition-reset"){
   if(roomHosts.get(room)!==s.id)return;
   getRoomEvents(room).clear();io.to(room).emit("game:event",{type,id,layer:1} satisfies SharedEvent);return;
  }
  if(type==="layer"&&id==="layer-2-entry"){
   if(current.layer!==1||!accepted(current,type,id,room,v.digit))return;
   const event:SharedEvent={type,id,layer:2};getRoomEvents(room).set("layer:layer-2-entry",event);
   current.layer=2;current.x=0;current.y=1.65;current.z=12;current.updatedAt=Date.now();
   io.to(room).emit("game:event",event);return;
  }
  if(layer!==current.layer||!["collect","gate","code","complete"].includes(type)||!accepted(current,type,id,room,v.digit))return;
  if(type==="collect"&&has(room,id))return;
  if(type==="gate"&&gateOpen(room,id))return;
  if(type==="code"&&getRoomEvents(room).has("code:"+id))return;
  const event:SharedEvent={type:type as SharedEvent["type"],id,layer};
  if(type==="collect"&&typeof itemPositions[id].digit==="number")event.digit=itemPositions[id].digit;
  if(type==="collect")getRoomEvents(room).set("collect:"+id,event);
  else if(type==="gate")getRoomEvents(room).set("gate:"+id,event);
  else getRoomEvents(room).set(type+":"+id,event);
  io.to(room).emit("game:event",event);
 });
 s.on("disconnect",()=>{
  players.delete(s.id);
  if(roomHosts.get(room)===s.id){const next=roomPlayers(room)[0];if(next)roomHosts.set(room,next.id);else roomHosts.delete(room);}
  io.to(room).emit("players:state",snapshot(room));cleanupRoom(room);
 });
});
const timer=setInterval(()=>{const rooms=new Set([...players.values()].map(p=>p.room));for(const room of rooms)io.to(room).emit("players:state",snapshot(room));},100);timer.unref();
const port=Number(process.env.PORT??3001);http.listen(port,"0.0.0.0",()=>console.log("Realtime server listening on "+port));
