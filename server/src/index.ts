import express from 'express';
import cors from 'cors';
import {createServer} from 'node:http';
import {Server} from 'socket.io';

const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'32kb'}));

const origins=(process.env.CLIENT_ORIGIN??'http://localhost:5173')
  .split(',').map(s=>s.trim()).filter(Boolean);
app.use(cors({
  origin(origin,cb){
    if(!origin||origins.includes('*')||origins.includes(origin)) cb(null,true);
    else cb(new Error('Origin not allowed'));
  }
}));

const http=createServer(app);
const io=new Server(http,{
  cors:{origin:origins.includes('*')?'*':origins,methods:['GET','POST']},
  maxHttpBufferSize:100000,
  pingInterval:25000,
  pingTimeout:20000
});

type Player={id:string;x:number;y:number;z:number;yaw:number;updatedAt:number;lastPacketAt:number};
const players=new Map<string,Player>();
app.get('/health',(_req,res)=>res.json({
  ok:true,service:'scotomaphobia-realtime',players:players.size,
  uptimeSeconds:Math.floor(process.uptime())
}));

const number=(v:unknown,min:number,max:number)=>
  typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:undefined;
const snapshot=()=>[...players.values()].map(({updatedAt:_,lastPacketAt:__,...p})=>p);

io.on('connection',s=>{
  const now=Date.now();
  players.set(s.id,{id:s.id,x:0,y:1.65,z:5,yaw:0,updatedAt:now,lastPacketAt:0});
  s.emit('players:state',snapshot());

  s.on('player:move',(v:unknown)=>{
    const current=players.get(s.id);
    if(!current||!v||typeof v!=='object')return;
    const packetNow=Date.now();
    // Ignore packet floods; rendering runs faster than the network needs to.
    if(packetNow-current.lastPacketAt<25)return;
    current.lastPacketAt=packetNow;

    const p=v as Record<string,unknown>;
    const x=number(p.x,-250,250),y=number(p.y,-10,100),
      z=number(p.z,-250,250),yaw=number(p.yaw,-Math.PI*100,Math.PI*100);
    if(x===undefined||y===undefined||z===undefined||yaw===undefined)return;

    const elapsed=Math.max((packetNow-current.updatedAt)/1000,0);
    // Permit normal walking and small network jitter, but reject large teleports.
    const maxDistance=7*elapsed+0.35;
    if(Math.hypot(x-current.x,z-current.z)>maxDistance)return;
    if(Math.abs(y-current.y)>Math.max(1.25,7*elapsed+0.5))return;

    players.set(s.id,{...current,x,y,z,yaw,updatedAt:packetNow});
  });

  s.on('disconnect',()=>players.delete(s.id));
});

// Broadcast at a fixed cadence instead of once per movement packet from every client.
const broadcastTimer=setInterval(()=>io.emit('players:state',snapshot()),50);
broadcastTimer.unref();

const port=Number(process.env.PORT??3001);
http.listen(port,'0.0.0.0',()=>console.log('Realtime server listening on '+port));
