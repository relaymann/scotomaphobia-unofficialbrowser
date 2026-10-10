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
const players=new Map<string,Player>();
const roomEvents=new Map<string,Map<string,SharedEvent>>();
const validIds=new Set(["l1-house-key","l1-house-door","l1-white-door","l1-elevator","l2-finish-gate","l2-seal-code","layer-2-entry","expedition-complete","expedition-reset",...Array.from({length:9},(_,i)=>"l1-note-"+(i+1)),...Array.from({length:7},(_,i)=>"l1-orb-"+(i+1)),...Array.from({length:7},(_,i)=>"l2-crystal-"+(i+1)),...Array.from({length:4},(_,i)=>"l2-clue-"+(i+1))]);
function getRoomEvents(room:string){let events=roomEvents.get(room);if(!events){events=new Map<string,SharedEvent>();roomEvents.set(room,events);}return events;}
function snapshot(room:string){return [...players.values()].filter(p=>p.room===room).map(({updatedAt:_,lastPacketAt:__,room:___,...p})=>p);}
app.get("/health",(_req,res)=>res.json({ok:true,service:"scotomaphobia-realtime",players:players.size,rooms:roomEvents.size,sharedEvents:[...roomEvents.values()].reduce((n,e)=>n+e.size,0),uptimeSeconds:Math.floor(process.uptime())}));
const number=(v:unknown,min:number,max:number)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max?v:undefined;
io.on("connection",s=>{
 const requested=s.handshake.query.room,room=typeof requested==="string"&&/^[A-Z0-9]{6}$/.test(requested)?requested:"PUBLIC";
 s.join(room);
 const resetRoom=s.handshake.query.reset==="1";
 if(resetRoom){getRoomEvents(room).clear();s.to(room).emit("game:event",{type:"reset",id:"expedition-reset",layer:1} satisfies SharedEvent);}
 const now=Date.now();
 players.set(s.id,{id:s.id,room,x:0,y:1.65,z:12,yaw:0,layer:1,updatedAt:now,lastPacketAt:0});
 s.emit("players:state",snapshot(room));s.emit("game:events",[...getRoomEvents(room).values()]);s.to(room).emit("players:state",snapshot(room));
 s.on("player:move",(value:unknown)=>{
  const current=players.get(s.id);if(!current||!value||typeof value!=="object")return;
  const t=Date.now();if(t-current.lastPacketAt<25)return;current.lastPacketAt=t;
  const p=value as Record<string,unknown>,x=number(p.x,-250,250),y=number(p.y,-10,100),z=number(p.z,-250,250),yaw=number(p.yaw,-Math.PI*100,Math.PI*100);
  const layer=p.layer===1||p.layer===2?p.layer:undefined;if(x===undefined||y===undefined||z===undefined||yaw===undefined||!layer)return;
  if(layer===current.layer){const dt=Math.max((t-current.updatedAt)/1000,0);if(Math.hypot(x-current.x,z-current.z)>9*dt+.45)return;if(Math.abs(y-current.y)>Math.max(1.4,9*dt+.5))return;}
  players.set(s.id,{...current,x,y,z,yaw,layer,updatedAt:t});
 });
 s.on("game:event",(value:unknown)=>{
  if(!value||typeof value!=="object")return;const v=value as Record<string,unknown>,types=["collect","gate","code","complete","layer","reset"];
  if(typeof v.id!=="string"||!validIds.has(v.id)||!types.includes(String(v.type))||(v.layer!==1&&v.layer!==2))return;
  const type=v.type as SharedEvent["type"],layer=v.layer as Layer,id=v.id;
  if(type==="reset"&&id==="expedition-reset"){getRoomEvents(room).clear();s.to(room).emit("game:event",{type,id,layer:1} satisfies SharedEvent);return;}
  const allowed=(type==="collect"&&/^(l1-note-[1-9]|l1-orb-[1-7]|l1-house-key|l2-crystal-[1-7]|l2-clue-[1-4])$/.test(id))||
   (type==="gate"&&["l1-house-door","l1-white-door","l2-finish-gate"].includes(id))||
   (type==="code"&&id==="l2-seal-code")||(type==="complete"&&id==="expedition-complete")||(type==="layer"&&id==="layer-2-entry"&&layer===2);
  if(!allowed)return;const event:SharedEvent={type,id,layer};
  const digit=number(v.digit,1,9);if(type==="collect"&&digit!==undefined&&Number.isInteger(digit))event.digit=digit;
  getRoomEvents(room).set(type+":"+layer+":"+id,event);s.to(room).emit("game:event",event);
 });
 s.on("disconnect",()=>{players.delete(s.id);io.to(room).emit("players:state",snapshot(room));});
});
const timer=setInterval(()=>{const rooms=new Set([...players.values()].map(p=>p.room));for(const room of rooms)io.to(room).emit("players:state",snapshot(room));},50);timer.unref();
const port=Number(process.env.PORT??3001);http.listen(port,"0.0.0.0",()=>console.log("Realtime server listening on "+port));
