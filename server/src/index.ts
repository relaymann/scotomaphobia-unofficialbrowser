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
type Player={id:string;x:number;y:number;z:number;yaw:number;layer:Layer;updatedAt:number;lastPacketAt:number};
type SharedEvent={type:"collect"|"gate"|"maze"|"code"|"checkpoint"|"complete";id:string;layer:Layer;digit?:number;checkpoint?:{layer:Layer;x:number;y:number;z:number}};
const players=new Map<string,Player>(),sharedEvents=new Map<string,SharedEvent>();
const validIds=new Set(["l1-relay-a","l1-relay-b","l1-relay-c","l1-bunker-gate","l1-maze-console","l1-checkpoint","l1-maze-gate","l1-descent-gate","l1-maintenance-maze","l2-finish-gate","l2-seal-code","expedition-complete",...Array.from({length:7},(_,i)=>"l2-crystal-"+(i+1)),...Array.from({length:4},(_,i)=>"l2-clue-"+(i+1))]);
app.get("/health",(_req,res)=>res.json({ok:true,service:"scotomaphobia-realtime",players:players.size,sharedEvents:sharedEvents.size,uptimeSeconds:Math.floor(process.uptime())}));
const number=(v:unknown,min:number,max:number)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max?v:undefined;
const snapshot=()=>[...players.values()].map(({updatedAt:_,lastPacketAt:__,...p})=>p);
io.on("connection",s=>{
 const now=Date.now();players.set(s.id,{id:s.id,x:0,y:1.65,z:12,yaw:0,layer:1,updatedAt:now,lastPacketAt:0});
 s.emit("players:state",snapshot());s.emit("game:events",[...sharedEvents.values()]);
 s.on("player:move",(value:unknown)=>{
  const current=players.get(s.id);if(!current||!value||typeof value!=="object")return;
  const t=Date.now();if(t-current.lastPacketAt<25)return;current.lastPacketAt=t;
  const p=value as Record<string,unknown>,x=number(p.x,-250,250),y=number(p.y,-10,100),z=number(p.z,-250,250),yaw=number(p.yaw,-Math.PI*100,Math.PI*100);
  const layer=p.layer===1||p.layer===2?p.layer:undefined;if(x===undefined||y===undefined||z===undefined||yaw===undefined||!layer)return;
  if(layer===current.layer){const dt=Math.max((t-current.updatedAt)/1000,0);if(Math.hypot(x-current.x,z-current.z)>9*dt+.45)return;if(Math.abs(y-current.y)>Math.max(1.4,9*dt+.5))return;}
  players.set(s.id,{...current,x,y,z,yaw,layer,updatedAt:t});
 });
 s.on("game:event",(value:unknown)=>{
  if(!value||typeof value!=="object")return;const v=value as Record<string,unknown>,types=["collect","gate","maze","code","checkpoint","complete"];
  if(typeof v.id!=="string"||!validIds.has(v.id)||!types.includes(String(v.type))||(v.layer!==1&&v.layer!==2))return;
  const type=v.type as SharedEvent["type"],layer=v.layer as Layer,id=v.id;
  const allowed=(type==="collect"&&/^(l1-relay-[abc]|l2-crystal-[1-7]|l2-clue-[1-4])$/.test(id))||
   (type==="gate"&&["l1-bunker-gate","l1-maze-gate","l2-finish-gate"].includes(id))||
   (type==="maze"&&id==="l1-maintenance-maze")||(type==="code"&&id==="l2-seal-code")||
   (type==="checkpoint"&&id==="l1-checkpoint")||(type==="complete"&&id==="expedition-complete");
  if(!allowed)return;const event:SharedEvent={type,id,layer};
  const digit=number(v.digit,1,9);if(type==="collect"&&digit!==undefined&&Number.isInteger(digit))event.digit=digit;
  if(type==="checkpoint"&&v.checkpoint&&typeof v.checkpoint==="object"){
   const cp=v.checkpoint as Record<string,unknown>,x=number(cp.x,-250,250),y=number(cp.y,0,20),z=number(cp.z,-250,250);
   if((cp.layer!==1&&cp.layer!==2)||x===undefined||y===undefined||z===undefined||cp.layer!==layer)return;
   event.checkpoint={layer,x,y,z};
  }
  sharedEvents.set(type+":"+layer+":"+id,event);s.broadcast.emit("game:event",event);
 });
 s.on("disconnect",()=>players.delete(s.id));
});
const timer=setInterval(()=>io.emit("players:state",snapshot()),50);timer.unref();
const port=Number(process.env.PORT??3001);http.listen(port,"0.0.0.0",()=>console.log("Realtime server listening on "+port));
