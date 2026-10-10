import * as THREE from "three";

export type LayerId = 1 | 2;
export type ItemKind = "relay" | "gate" | "maze" | "checkpoint" | "layer-exit" | "crystal" | "clue" | "cipher" | "finish";
export type FloorRect = { minX:number; maxX:number; minZ:number; maxZ:number; y:number };
export type HazardZone = { id:string; minX:number; maxX:number; minZ:number; maxZ:number; targetX:number; targetZ:number; message:string };
export type WorldItem = {
  id:string; label:string; kind:ItemKind; position:THREE.Vector3; radius:number;
  description:string; object:THREE.Group; blocker?:THREE.Box3; leaf?:THREE.Object3D; digit?:number;
};
export type BuiltWorld = {
  root:THREE.Group; layer:LayerId; colliders:THREE.Box3[]; floors:FloorRect[]; hazards:HazardZone[];
  items:WorldItem[]; spawn:THREE.Vector3; stalker?:THREE.Group;
};

export function buildWorld(layer:LayerId):BuiltWorld {
  const root=new THREE.Group(),colliders:THREE.Box3[]=[],floors:FloorRect[]=[],hazards:HazardZone[]=[],items:WorldItem[]=[];
  const materials=new Map<string,THREE.MeshStandardMaterial>();
  const mat=(c:string,e?:string,i=0.35)=>{
    const k=c+"|"+(e||"")+"|"+i;let m=materials.get(k);
    if(!m){m=new THREE.MeshStandardMaterial({color:c,roughness:0.94,metalness:0.035,emissive:e||"#000000",emissiveIntensity:i});materials.set(k,m);}
    return m;
  };
  const box=(x:number,y:number,z:number,sx:number,sy:number,sz:number,c:string,solid=false,e?:string)=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat(c,e));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);
    if(solid)colliders.push(new THREE.Box3(new THREE.Vector3(x-sx/2,y-sy/2,z-sz/2),new THREE.Vector3(x+sx/2,y+sy/2,z+sz/2)));
    return m;
  };
  const floor=(x:number,z:number,sx:number,sz:number,c:string,y=0)=>{
    box(x,y-0.25,z,sx,0.5,sz,c);floors.push({minX:x-sx/2,maxX:x+sx/2,minZ:z-sz/2,maxZ:z+sz/2,y});
  };
  const lamp=(x:number,y:number,z:number,c:string,p=1.8,r=11)=>{
    const orb=new THREE.Mesh(new THREE.SphereGeometry(0.15,8,8),mat(c,c,1.8));orb.position.set(x,y,z);root.add(orb);
    const light=new THREE.PointLight(c,p,r,1.8);light.position.set(x,y,z);root.add(light);
  };
  const firepit=(id:string,x:number,z:number,targetX:number,targetZ:number)=>{
    const base=new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.32,.16,16),mat("#3a2820","#9e3d1c",.8));
    base.position.set(x,.04,z);root.add(base);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.05,.095,8,22),mat("#b65b2a","#e15b21",1.5));
    ring.rotation.x=Math.PI/2;ring.position.set(x,.16,z);root.add(ring);
    for(let i=0;i<3;i++){
      const flame=new THREE.Mesh(new THREE.ConeGeometry(.25+i*.04,.9+i*.18,7),mat(i===1?"#ffc46b":"#e65d25",i===1?"#ffae35":"#f04417",1.8));
      flame.position.set(x+(i-1)*.38,.62+(i===1?.12:0),z+(i%2?-.08:.1));root.add(flame);
    }
    lamp(x,1,z,"#f16a28",2.4,7);
    hazards.push({id,minX:x-1.05,maxX:x+1.05,minZ:z-1.05,maxZ:z+1.05,targetX,targetZ,
      message:"The firepit folds space around you and throws you somewhere else."});
  };
  const rock=(x:number,y:number,z:number,sx:number,sy:number,sz:number,c:string)=>{
    const o=new THREE.Mesh(new THREE.DodecahedronGeometry(1,1),mat(c));o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.rotation.y=(x+z)*0.03;o.castShadow=true;root.add(o);
  };
  const tree=(x:number,z:number,s=1)=>{
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.16*s,.27*s,2.7*s,6),mat("#332a21"));trunk.position.set(x,1.35*s,z);root.add(trunk);
    for(let i=0;i<3;i++){const cone=new THREE.Mesh(new THREE.ConeGeometry((1.5-i*.25)*s,2.35*s,7),mat(i===1?"#182720":"#202e24"));cone.position.set(x,(2.5+i*.7)*s,z);root.add(cone);}
  };
  const item=(id:string,label:string,kind:ItemKind,x:number,z:number,color:string,description:string,radius=3,digit?:number)=>{
    const g=new THREE.Group();g.position.set(x,0,z);root.add(g);
    let leaf:THREE.Object3D|undefined,blocker:THREE.Box3|undefined;
    if(kind==="gate"||kind==="layer-exit"||kind==="finish"){
      const w=kind==="gate"?7:8,frame=kind==="gate"?"#51473a":"#36463e";
      for(const side of [-1,1])box(x+side*w/2,2,z,.65,4,.85,frame,true);
      box(x,4,z,w+.65,.5,.9,frame,true);
      leaf=box(x,1.95,z,w-.65,3.65,.38,kind==="gate"?"#171a17":"#101715",false,color);
      const seal=new THREE.Mesh(new THREE.OctahedronGeometry(.48),mat(color,color,1.7));seal.position.set(0,2.05,.3);g.add(seal);
      const light=new THREE.PointLight(color,2.2,13);light.position.set(0,2.2,1);g.add(light);
      blocker=new THREE.Box3(new THREE.Vector3(x-w/2+.3,0,z-.3),new THREE.Vector3(x+w/2-.3,4,z+.3));colliders.push(blocker);
    }else if(kind==="maze"||kind==="cipher"){
      box(x,.8,z,1.3,1.6,.9,"#232a27",true);
      box(x,1.17,z+.48,.96,.62,.08,kind==="maze"?"#6e9a90":"#76b78a",false,color);
      for(let j=0;j<3;j++)box(x-.25+j*.25,.35,z+.52,.08,.08,.08,"#d18a50",false,"#d18a50");
      const sig=new THREE.Mesh(new THREE.OctahedronGeometry(.25),mat(color,color,1.3));sig.position.set(0,1.65,0);g.add(sig);
      const light=new THREE.PointLight(color,1.1,7);light.position.set(0,1.5,0);g.add(light);
    }else if(kind==="checkpoint"){
      const plinth=new THREE.Mesh(new THREE.CylinderGeometry(.8,.95,.3,8),mat("#383f3c"));plinth.position.y=.15;g.add(plinth);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.72,.085,8,24),mat(color,color,1.5));ring.position.y=1.1;g.add(ring);
      const light=new THREE.PointLight(color,1.4,10);light.position.set(0,1,0);g.add(light);
    }else{
      const plinth=new THREE.Mesh(new THREE.CylinderGeometry(.55,.8,.45,8),mat("#353c38"));plinth.position.y=.22;g.add(plinth);
      const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(kind==="crystal"?.72:.55),mat(color,color,kind==="crystal"?1.9:1.3));crystal.position.y=1.1;crystal.rotation.set(.2,.3,0);g.add(crystal);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.68,.035,6,20),mat(color,color,1));ring.position.y=.82;ring.rotation.x=Math.PI/2;g.add(ring);
      const light=new THREE.PointLight(color,kind==="crystal"?1.7:1.1,9);light.position.set(0,1.4,0);g.add(light);
    }
    const out:WorldItem={id,label,kind,position:new THREE.Vector3(x,1.2,z),radius,description,object:g,blocker,leaf,digit};
    items.push(out);return out;
  };

  if(layer===1){
    floor(0,0,44,54,"#343d31");floor(0,-54,21,24,"#34392e");floor(0,-70,21,16,"#34392e");
    floor(-8,-14,13,20,"#713f2c",-0.02);floor(8,-14,13,20,"#713f2c",-0.02);
    for(const side of [-1,1]){
      for(let i=0;i<10;i++){const z=20-i*8.1;rock(side*(10+(i%3)*2.2),1.8,z,3.2+(i%2),2.5+(i%3)*.4,4.8,"#51584b");if(i%2===0)rock(side*(15+i%3),2.3,z-2,4.8,3.2,5.8,"#343e34");}
      for(let i=0;i<5;i++)tree(side*(10+i%2*4),14-i*8,.8+(i%3)*.1);
      box(side*12,2.2,-55,1.1,4.4,25,"#484c41",true);
      box(side*6.7,2.3,-103,.8,4.6,59,"#383c35",true);
      box(side*6.7,2.3,-177,.8,4.6,48,"#232c2a",true);
    }
    for(const z of [-27,-29,-31,-34,-36,-38,-41,-43]){
      floor(0,z,4.7,1.72,z===-34||z===-41?"#3e443f":"#494b46",.08);
      box(-2.45,.35,z,.12,.7,1.7,"#60615a");box(2.45,.35,z,.12,.7,1.7,"#60615a");
    }
    floor(0,-106,12.5,60,"#2a2d29");floor(0,-130,12.5,12,"#2a2d29");
    // The bunker facade keeps its centre open; the gate leaf provides the locked collision.
    box(-5.1,2.2,-77,4.2,4.4,.8,"#4a463b",true);box(5.1,2.2,-77,4.2,4.4,.8,"#4a463b",true);
    box(-4.2,2,-79,.6,4,4,"#51483b",true);box(4.2,2,-79,.6,4,4,"#51483b",true);
    for(let i=0;i<7;i++){
      const z=-84-i*7.2;box(0,3.65,z,12.2,.24,.34,"#45443b");
      box(-5.8,.02,z,.35,.04,3.7,"#65533c");box(5.8,.02,z,.35,.04,3.7,"#65533c");
      if(i%2===0){lamp(-4.8,2.7,z-1,"#e18a37",1.35,8);lamp(4.8,2.7,z-1,"#dc8534",1.35,8);}
    }
    for(let i=0;i<8;i++)box(-3.8+(i%4)*2.5,.16,-94-Math.floor(i/4)*2.5,1.8,.22,1.6,"#3c3d36");
    const water=new THREE.Mesh(new THREE.PlaneGeometry(28,51),new THREE.MeshStandardMaterial({color:"#0b3037",roughness:.26,metalness:.25,transparent:true,opacity:.84,emissive:"#03161e",emissiveIntensity:.7}));
    water.rotation.x=-Math.PI/2;water.position.set(0,-2.7,-164);root.add(water);
    for(let i=0;i<6;i++){const z=-140-i*5.7,x=i%2===0?-1.15:1.15;floor(x,z,4.8,4.1,i%2===0?"#4a4a43":"#3d4543");rock(x,.12,z,1.45,.22,1.25,"#5d625a");if(i===1||i===4)lamp(x,.55,z,"#ee8b35",1.3,7);}
    floor(0,-177,17,21,"#323931");
    for(let i=0;i<4;i++)rock(i%2?6:-6,1.2,-181-i*3,1.8,1.4,2.4,"#353c34");
    box(-4.7,.45,-89,1.2,.9,.8,"#51463a",true);box(4.8,.55,-119,1.1,1.1,1.1,"#373b36",true);lamp(0,3.1,-126,"#4fa8b7",1.6,10);
    item("l1-relay-a","Field relay A","relay",-6,-2,"#e6b45a","A cracked field relay still holds a charge. Recover it before entering the bunker.",3);
    item("l1-relay-b","Field relay B","relay",6,-11,"#e6b45a","This relay was left beneath a split stone arch.",3);
    item("l1-relay-c","Field relay C","relay",0,-21,"#e6b45a","The last relay flickers beside the broken approach.",3);
    item("l1-bunker-gate","Bunker seal","gate",0,-77,"#c98250","The bunker door needs all three field relays.",4);
    item("l1-maze-console","Maintenance maze","maze",-3.9,-109,"#54b5b0","Trace a safe route through the maintenance maze to release the submerged lock.",3.2);
    item("l1-checkpoint","Flood chamber checkpoint","checkpoint",0,-130,"#65b7c7","A stable beacon. Activate it before crossing the flooded chamber.",3);
    item("l1-maze-gate","Flood lock","gate",0,-136,"#49b9c7","The flood lock releases when the maintenance maze is solved.",3);
    item("l1-descent-gate","Descent gate","layer-exit",0,-186,"#49b9c7","The descent gate leads into the monolith field.",3.5);
    rock(-9,.8,-48,2,1.2,3,"#4f5749");rock(9,.8,-48,2,1.2,3,"#4f5749");
    const stalker=new THREE.Group();stalker.position.set(0,0,-125);root.add(stalker);
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.38,1.35,4,8),mat("#080b0b","#101819",.7));body.position.y=1.05;stalker.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.36,12,10),mat("#050606","#101b1d",.5));head.position.y=2;stalker.add(head);
    for(const side of [-1,1]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.065,8,8),mat("#b7e8e6","#7ee8e2",2.2));eye.position.set(side*.14,2.03,-.31);stalker.add(eye);const leg=new THREE.Mesh(new THREE.CylinderGeometry(.13,.17,.9,6),mat("#070909"));leg.position.set(side*.2,.28,0);stalker.add(leg);}
    stalker.visible=false;
    return {root,layer,colliders,floors,hazards,items,spawn:new THREE.Vector3(0,1.65,12),stalker};
  }

  floor(0,-13,102,101,"#252a2d");
  const perimeter="#11181b";
  box(-51,3,-14,1,6,103,perimeter,true);box(51,3,-14,1,6,103,perimeter,true);
  box(-28,3,-64,46,6,1,perimeter,true);box(28,3,-64,46,6,1,perimeter,true);
  box(0,3,36,102,6,1,perimeter,true);
  const pyramid=(x:number,z:number,s:number)=>{
    for(let i=0;i<5;i++){const width=(5.7-i*.82)*s,h=.7*s,depth=(5.2-i*.7)*s;box(x,.35*s+i*.7*s,z+i*.52*s,width,h,depth,"#78806b",true);box(x,.35*s+i*.7*s,z+i*.52*s+depth/2+.03,width,.05,.06,"#a4ae91",false,"#45554a");}
    box(x,1.4*s,z+3.2*s,1.8*s,2.8*s,.32,"#101715",false,"#6b8674");
    for(const side of [-1,1])box(x+side*1.25*s,1.7*s,z+3.15*s,.2,3.4*s,.45,"#555d4e",true);
    lamp(x,2.4*s,z+2.85*s,"#d5e7d2",.75,7);
  };
  pyramid(-23,-7,1.1);pyramid(20,-10,1);pyramid(-34,-31,.88);pyramid(32,-32,.92);
  for(let i=0;i<8;i++){const z=25-i*10;rock(-43,1,z,3.3,1.8,4.5,"#38413b");rock(43,1,z-3,3.3,1.8,4.5,"#38413b");}
  for(const x of [-8,8,-39,39])for(let i=0;i<4;i++){box(x,2,-15-i*10,.65,4,.65,"#333d37",true);lamp(x,3.4,-15-i*10,"#9cbda5",.6,6);}
  floor(0,-47,30,8,"#321c1f");
  for(let i=0;i<7;i++)box(-12+i*4,.06,-47,.11,.1,7,"#8f252c",false,"#c32835");
  for(const z of [-44,-50]){lamp(-13,1.4,z,"#d63c3c",1.4,10);lamp(13,1.4,z,"#d63c3c",1.4,10);}
  // These unmistakable ember pads act as the layer's teleport hazards.
  firepit("ember-well-a",-10,-10,25,-28);
  firepit("ember-well-b",10,-25,-30,0);
  firepit("ember-well-c",-30,-45,20,10);
  firepit("ember-well-d",30,-48,-4,-15);
  const crystalPositions:[number,number][]=[[-28,5],[28,7],[-40,-12],[40,-18],[-17,-39],[16,-38],[5,-30]];
  crystalPositions.forEach((p,i)=>item("l2-crystal-"+(i+1),"Pale crystal "+(i+1),"crystal",p[0],p[1],"#9ad7d3","A pale crystal resonates with the chamber. Collect all seven.",2.8));
  item("l2-clue-1","First inscription","clue",-22,-17,"#d9e4c9","FIRST MARK: 2. The first digit is two.",3,2);
  item("l2-clue-2","Second inscription","clue",21,-22,"#d9e4c9","SECOND MARK: 7. The second digit is seven.",3,7);
  item("l2-clue-3","Third inscription","clue",-15,-45,"#d9e4c9","THIRD MARK: 1. The third digit is one.",3,1);
  item("l2-clue-4","Fourth inscription","clue",31,-42,"#d9e4c9","FINAL MARK: 4. The last digit is four.",3,4);
  item("l2-cipher-terminal","Seal terminal","cipher",0,-52,"#9ad7d3","The seal terminal requires seven crystals and the four-digit inscription code.",3.2);
  item("l2-finish-gate","Final gate","finish",0,-60,"#9ed7b9","The final gate opens after the seal terminal accepts the code.",3.5);
  for(let i=0;i<5;i++)box(-2.6+i*1.3,.02,-61,.75,.04,.75,"#7e9388",false,"#47745e");
  const stalker=new THREE.Group();stalker.position.set(0,0,-35);root.add(stalker);
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.62,2.2,5,8),mat("#020404","#152020",.7));body.position.y=1.4;stalker.add(body);
  const face=new THREE.Mesh(new THREE.SphereGeometry(.53,12,10),mat("#010202"));face.position.y=2.7;stalker.add(face);
  for(const side of [-1,1]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.09,8,8),mat("#d4ffed","#86f3ca",2.4));eye.position.set(side*.2,2.72,-.46);stalker.add(eye);}
  stalker.visible=false;lamp(0,4,-32,"#d6eee0",1.3,17);
  return {root,layer,colliders,floors,hazards,items,spawn:new THREE.Vector3(0,1.65,12),stalker};
}
